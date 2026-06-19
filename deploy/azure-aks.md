# Production on Azure (AKS)

Deploys the platform to **AKS** with managed **PostgreSQL** + **Redis**, MinIO
in-cluster, images in **ACR**, **NGINX Ingress + cert-manager (Let's Encrypt)**
for real TLS, and the `values-aks.yaml` overlay of the same Helm chart.

> **Fast path:** `bash deploy/azure-provision.sh` runs §1–5 end-to-end for
> gocheckpro and prints the DNS records, GitHub vars/secrets, and the exact
> `helm` command. The steps below are the manual equivalent / reference.

## 0. Variables
```bash
RG=gocheckpro-rg
LOC=uaenorth                       # closest region to Iraq; change if needed
ACR=gocheckproacr$RANDOM           # must be globally unique
AKS=gocheckpro-aks
PG=gocheckpro-pg-$RANDOM           # globally unique
REDIS=gocheckpro-redis-$RANDOM     # globally unique
DOMAIN=gocheckpro.com
# Hosts: app.$DOMAIN (web), api.$DOMAIN (API), files.$DOMAIN (MinIO)
```

## 1. Resource group + ACR + AKS (with ACR attached)
```bash
az group create -n $RG -l $LOC
az acr create -n $ACR -g $RG --sku Basic
az aks create -n $AKS -g $RG --node-count 2 -s Standard_D4s_v5 \
  --attach-acr $ACR --generate-ssh-keys
az aks get-credentials -n $AKS -g $RG          # kubeconfig
```

## 2. Managed Postgres (Flexible Server) + database
```bash
az postgres flexible-server create -n $PG -g $RG -l $LOC \
  --tier Burstable --sku-name Standard_B1ms --version 16 \
  --admin-user ipadmin --admin-password 'REPLACE_strong_pw' \
  --public-access 0.0.0.0          # or VNet-integrate for private
az postgres flexible-server db create -g $RG -s $PG -d inspection
# DATABASE_URL (note sslmode=require):
# postgresql://ipadmin:REPLACE_strong_pw@$PG.postgres.database.azure.com:5432/inspection?schema=public&sslmode=require
```

## 3. Managed Redis
```bash
az redis create -n $REDIS -g $RG -l $LOC --sku Basic --vm-size c0
az redis list-keys -n $REDIS -g $RG --query primaryKey -o tsv   # the password
# host=$REDIS.redis.cache.windows.net  port=6380  tls=true
```

## 4. Cluster add-ons: ingress-nginx + cert-manager
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace

helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --set crds.enabled=true
```
Create a Let's Encrypt ClusterIssuer:
```bash
kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: REPLACE_you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

## 5. DNS
Get the ingress public IP and point your three hosts at it:
```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```
Create **A records** → that IP for:
`app.$DOMAIN`, `api.$DOMAIN`, `files.$DOMAIN`.

## 6. Build + push images to ACR
**CI does this automatically** once you set, on the GitHub repo:
- variable **`ACR_LOGIN_SERVER`** = `<acr>.azurecr.io`
- variable **`NEXT_PUBLIC_API_URL`** = `https://api.$DOMAIN` (baked into web)
- secrets **`ACR_USERNAME`** / **`ACR_PASSWORD`** (ACR admin creds or a service principal)

Then every push to `main` builds + pushes `…/inspection/{api,web,pdf}:<sha>` and `:latest`.
Or build manually:
```bash
az acr login -n $ACR
REG=$ACR.azurecr.io/inspection
docker build -f apps/api/Dockerfile -t $REG/api:latest . && docker push $REG/api:latest
docker build -f services/pdf/Dockerfile -t $REG/pdf:latest . && docker push $REG/pdf:latest
# web bakes the API URL at build time:
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.$DOMAIN \
  -t $REG/web:latest . && docker push $REG/web:latest
```

## 7. Deploy the chart (AKS overlay)
Fill `deploy/openshift/inspection-platform/values-aks.yaml` (or pass `--set`):
```bash
cd deploy/openshift
helm upgrade --install inspection ./inspection-platform \
  -n inspection --create-namespace \
  -f ./inspection-platform/values-aks.yaml \
  --set appsDomain=$DOMAIN \
  --set image.registry=$ACR.azurecr.io/inspection \
  --set postgres.externalDatabaseUrl="postgresql://ipadmin:REPLACE_strong_pw@$PG.postgres.database.azure.com:5432/inspection?schema=public&sslmode=require" \
  --set redis.externalHost=$REDIS.redis.cache.windows.net \
  --set redis.password="REPLACE_redis_key" \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.jwtRefreshSecret="$(openssl rand -hex 32)" \
  --set minio.rootPassword="$(openssl rand -hex 16)"
```

## 8. Seed + verify
`values-aks.yaml` sets `migrations.job: true`, so `prisma migrate deploy` runs
**automatically** as a pre-install/pre-upgrade hook Job before the api rolls out
(safe with multiple api replicas). Just seed once and verify:
```bash
kubectl -n inspection rollout status deploy/inspection-api
kubectl -n inspection exec deploy/inspection-api -- npx prisma db seed
```
Browse **https://app.$DOMAIN** (trusted cert — no warnings). Point the
iOS/Android apps' base URL at **https://api.$DOMAIN** (no CA install
needed now — it's a real cert).

---

## Production checklist / known follow-ups
- **Migrations**: ✅ handled by a pre-deploy hook Job (`migrations.job: true`) —
  multi-replica safe.
- **Email**: ✅ supported — set `smtp.host/port/secure/user/password/from` in the
  overlay (auth + STARTTLS/TLS handled) and keep `mailpit.enabled=false`.
- **Secrets**: prefer Azure Key Vault + the Secrets Store CSI driver over `--set`.
- **MinIO**: tighten the bucket from public-read to presigned reads.
- **Scaling**: add HPAs + PodDisruptionBudgets for web/api.
- **Backups**: Flexible Server has automated backups; verify retention + test restore.
- **Observability**: enable Container Insights / Azure Monitor for the cluster.
