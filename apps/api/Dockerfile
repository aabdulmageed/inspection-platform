# API image — build from the repo root:
#   docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim

# OpenSSL for Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1

# Install workspace dependencies first (better layer caching).
COPY package.json package-lock.json* turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY services/pdf/package.json services/pdf/
RUN npm install

# Sources
COPY packages/types packages/types
COPY apps/api apps/api

WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# OpenShift / arbitrary-UID compatibility: the container runs as a random
# non-root UID that belongs to group 0. Make the app tree group-writable and
# point tooling at writable HOME/cache locations. (Harmless under root/compose.)
ENV HOME=/app \
    npm_config_cache=/tmp/.npm
RUN chgrp -R 0 /app && chmod -R g=u /app

EXPOSE 4000
# Plain start command. Migrations are driven by the Helm chart:
#  - migrations.job=true  → a pre-deploy hook Job runs `prisma migrate deploy`
#  - migrations.job=false → the Deployment prepends migrate to this command
CMD ["node", "dist/main.js"]
