#!/usr/bin/env bash
# =============================================================================
# One-shot Azure provisioning for gocheckpro (AKS + ACR + Postgres + Redis +
# ingress-nginx + cert-manager). Run with: bash deploy/azure-provision.sh
# Prereqs: az login (correct subscription), kubectl, helm.
# Idempotency: most `az ... create` calls are safe to re-run.
# =============================================================================
set -euo pipefail

# ---- EDIT THESE ----
LOC=uaenorth                       # closest Azure region to Iraq; change if needed
DOMAIN=gocheckpro.com
ACME_EMAIL=aws@gocheckpro.com           # for Let's Encrypt registration
PG_ADMIN=ipadmin
# Strong generated passwords (printed in the summary at the end):
PG_PASSWORD=$(openssl rand -hex 16)
# --------------------

RG=gocheckpro-rg
ACR=gocheckproacr17848             # reuse the registry created by the earlier run
AKS=gocheckpro-aks
PG=gocheckpro-pg-22220             # reuse the server created by the earlier run
REDIS=gocheckpro-redis-21719        # retain the name selected by the earlier run
SECRETS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.azure-provision"
if [ -x /opt/homebrew/opt/helm@3/bin/helm ]; then
  HELM_BIN=/opt/homebrew/opt/helm@3/bin/helm
else
  HELM_BIN=$(command -v helm)
fi

echo "==> Azure resource providers"
for provider in Microsoft.ContainerService Microsoft.DBforPostgreSQL Microsoft.Cache; do
  if [ "$(az provider show -n "$provider" --query registrationState -o tsv)" != "Registered" ]; then
    az provider register -n "$provider" --wait
  fi
done

echo "==> Resource group"
az group create -n "$RG" -l "$LOC" -o none

echo "==> ACR ($ACR) + admin user"
if ! az acr show -n "$ACR" -g "$RG" -o none 2>/dev/null; then
  az acr create -n "$ACR" -g "$RG" --sku Basic -o none
fi
az acr update -n "$ACR" --admin-enabled true -o none
ACR_LOGIN_SERVER=$(az acr show -n "$ACR" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show -n "$ACR" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)

echo "==> AKS ($AKS) with ACR attached"
if ! az aks show -n "$AKS" -g "$RG" -o none 2>/dev/null; then
  az aks create -n "$AKS" -g "$RG" --node-count 2 -s Standard_D2s_v5 \
    --attach-acr "$ACR" --generate-ssh-keys -o none
fi
az aks get-credentials -n "$AKS" -g "$RG" --overwrite-existing

echo "==> Postgres Flexible Server ($PG) + database"
if az postgres flexible-server show -n "$PG" -g "$RG" -o none 2>/dev/null; then
  az postgres flexible-server update -n "$PG" -g "$RG" \
    --admin-password "$PG_PASSWORD" -o none
else
  az postgres flexible-server create -n "$PG" -g "$RG" -l "$LOC" \
    --tier Burstable --sku-name Standard_B1ms --version 16 \
    --admin-user "$PG_ADMIN" --admin-password "$PG_PASSWORD" \
    --public-access 0.0.0.0 -y -o none         # allows Azure services; tighten later
fi
if ! az postgres flexible-server db show -g "$RG" -s "$PG" -d inspection -o none 2>/dev/null; then
  az postgres flexible-server db create -g "$RG" -s "$PG" -d inspection -o none
fi
PG_HOST="$PG.postgres.database.azure.com"
DATABASE_URL="postgresql://$PG_ADMIN:$PG_PASSWORD@$PG_HOST:5432/inspection?schema=public&sslmode=require"

echo "==> Azure Managed Redis ($REDIS)  (this one takes ~15-20 min)"
if ! az redisenterprise show -n "$REDIS" -g "$RG" -o none 2>/dev/null; then
  az redisenterprise create -n "$REDIS" -g "$RG" -l "$LOC" \
    --sku Balanced_B0 --clustering-policy NoCluster \
    --access-keys-auth Enabled --client-protocol Encrypted \
    --public-network-access Enabled -o none
fi
REDIS_HOST=$(az redisenterprise show -n "$REDIS" -g "$RG" --query hostName -o tsv)
REDIS_PORT=$(az redisenterprise database show --cluster-name "$REDIS" -g "$RG" \
  --query port -o tsv)
REDIS_KEY=$(az redisenterprise database list-keys --cluster-name "$REDIS" -g "$RG" \
  --query primaryKey -o tsv)

echo "==> Cluster add-ons: ingress-nginx + cert-manager"
"$HELM_BIN" repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
"$HELM_BIN" repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
"$HELM_BIN" repo update >/dev/null
"$HELM_BIN" upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace --wait \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
"$HELM_BIN" upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --set crds.enabled=true --wait

echo "==> Let's Encrypt ClusterIssuer"
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: $ACME_EMAIL
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

echo "==> Waiting for the ingress public IP..."
for i in $(seq 1 30); do
  IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  [ -n "${IP:-}" ] && break; sleep 10
done

(
  umask 077
  {
    printf 'ACR_LOGIN_SERVER=%q\n' "$ACR_LOGIN_SERVER"
    printf 'ACR_USERNAME=%q\n' "$ACR_USERNAME"
    printf 'ACR_PASSWORD=%q\n' "$ACR_PASSWORD"
    printf 'PG_HOST=%q\n' "$PG_HOST"
    printf 'PG_ADMIN=%q\n' "$PG_ADMIN"
    printf 'PG_PASSWORD=%q\n' "$PG_PASSWORD"
    printf 'DATABASE_URL=%q\n' "$DATABASE_URL"
    printf 'REDIS_HOST=%q\n' "$REDIS_HOST"
    printf 'REDIS_PORT=%q\n' "$REDIS_PORT"
    printf 'REDIS_KEY=%q\n' "$REDIS_KEY"
    printf 'INGRESS_IP=%q\n' "${IP:-}"
  } > "$SECRETS_FILE"
)

cat <<SUMMARY

============================================================================
 PROVISIONING DONE — next steps
============================================================================

1) DNS — create these A records at your registrar for $DOMAIN:
     app.$DOMAIN    -> $IP
     api.$DOMAIN    -> $IP
     files.$DOMAIN  -> $IP

2) GitHub repo settings (so CI builds + pushes images):
     Variables:
       ACR_LOGIN_SERVER   = $ACR_LOGIN_SERVER
       NEXT_PUBLIC_API_URL= https://api.$DOMAIN
     Secrets:
       ACR_USERNAME       = $ACR_USERNAME
       ACR_PASSWORD       = $ACR_PASSWORD
   Then push to main to build/push images, OR build manually (see azure-aks.md §6).

3) Deploy the chart (after images exist in ACR and DNS resolves):
     cd deploy/openshift
     helm upgrade --install inspection ./inspection-platform \
       -n inspection --create-namespace \
       -f ./inspection-platform/values-aks.yaml \
       --set image.registry=$ACR_LOGIN_SERVER/inspection \
       --set postgres.externalDatabaseUrl="$DATABASE_URL" \
       --set redis.externalHost=$REDIS_HOST \
       --set redis.externalPort=$REDIS_PORT \
       --set redis.password="$REDIS_KEY" \
       --set secrets.jwtSecret="\$(openssl rand -hex 32)" \
       --set secrets.jwtRefreshSecret="\$(openssl rand -hex 32)" \
       --set minio.rootPassword="\$(openssl rand -hex 16)"
     # (fill smtp.* in values-aks.yaml for email)

4) Seed once:
     kubectl -n inspection exec deploy/inspection-api -- npx prisma db seed

------------------------- SAVE THESE SECRETS -------------------------------
 ACR login server : $ACR_LOGIN_SERVER
 ACR username     : $ACR_USERNAME
 ACR password     : $ACR_PASSWORD
 Postgres host    : $PG_HOST  (user $PG_ADMIN)
 Postgres password: $PG_PASSWORD
 DATABASE_URL     : $DATABASE_URL
 Redis host       : $REDIS_HOST  (port $REDIS_PORT, TLS)
 Redis key        : $REDIS_KEY
 Ingress IP       : $IP
 Secrets file     : $SECRETS_FILE
============================================================================
SUMMARY
