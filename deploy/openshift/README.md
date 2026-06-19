# Running on OpenShift

A Helm chart that deploys the full platform to an OpenShift cluster:
`web` (Next.js) + `api` (NestJS/Prisma) + `pdf` (Puppeteer) + in-cluster
`postgres`, `minio` (photo storage) and `redis`, all built **in-cluster** from
the repo Dockerfiles and exposed through OpenShift **Routes** (TLS at the edge —
no Caddy needed here).

> The native mobile apps (`mobile/`) are clients, not server workloads — point
> them at the API Route host once it's up.

## Prerequisites

- `oc` logged in to your cluster, and `helm` 3.x.
- A project/namespace: `oc new-project inspection`
- Your cluster's apps domain:
  `oc get ingresses.config/cluster -o jsonpath='{.spec.domain}'`

## 1. Install the chart

```bash
cd deploy/openshift
helm upgrade --install inspection ./inspection-platform \
  --namespace inspection \
  --set appsDomain=apps.YOUR-CLUSTER.example.com \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.jwtRefreshSecret="$(openssl rand -hex 32)" \
  --set postgres.password="$(openssl rand -hex 16)" \
  --set minio.rootPassword="$(openssl rand -hex 16)"
```

This creates the Secret/ConfigMap, the PVC-backed stateful services, the app
Deployments, the Routes, and the ImageStreams + BuildConfigs.

Derived hostnames (override individually with `--set hosts.web=…` etc.):

| Service | Host |
| --- | --- |
| Web   | `inspection.<appsDomain>` |
| API   | `inspection-api.<appsDomain>` |
| MinIO | `inspection-minio.<appsDomain>` |

> The web bundle bakes in the API URL **at build time**, so `appsDomain`
> (or `hosts.api`) must be correct before you build the `web` image.

## 2. Build the images (in-cluster, binary uploads from the repo root)

```bash
cd ../..                      # repo root (where the Dockerfiles' build context lives)
EXCLUDE='(^|/)(node_modules|\.next|\.turbo|dist|\.git)(/|$)'   # skip bulky dirs on upload
oc start-build api --from-dir=. --exclude="$EXCLUDE" --follow
oc start-build pdf --from-dir=. --exclude="$EXCLUDE" --follow
oc start-build web --from-dir=. --exclude="$EXCLUDE" --follow
```

Deployments have image triggers, so they roll out automatically as each build
finishes. Re-run any `oc start-build` to ship a new version.

## 3. Seed the database (once)

```bash
oc rsh deploy/inspection-api npx prisma db seed
```

Login: `admin@check.test` / `password123` (inspector: `civil@check.test`).
Schema migrations (`prisma migrate deploy`) run automatically on every api start.

## Verify

```bash
oc get pods,routes,builds -l app.kubernetes.io/instance=inspection
```

Open `https://inspection.<appsDomain>` and log in.

## Notes & production hardening

- **Secrets**: the defaults are placeholders — always override them (as above) or
  set `secrets.create=false` and supply a Secret named `inspection-secrets`.
- **Mail**: a `mailpit` catcher is deployed by default. For real mail set
  `mailpit.enabled=false` and `smtp.host/smtp.port` to your SMTP server.
- **Postgres** uses the arbitrary-UID-safe `sclorg/postgresql-16` image so it runs
  under OpenShift's restricted SCC. Swap in a managed database by pointing
  `DATABASE_URL` at it (set `secrets.create=false` + your own Secret) and scaling
  the bundled postgres to 0.
- **Storage**: set `*.storageClassName` if you don't want the cluster default.
- **TLS**: Routes use edge termination. Bring your own cert by editing
  `templates/routes.yaml` or attaching a cluster certificate.
