# PDF service image (multi-stage) — build from the repo root:
#   docker build -f services/pdf/Dockerfile .
# Stage 1 builds with the full workspace; stage 2 ships system Chromium + the
# production deps + build output only (devDeps, sources, build caches dropped).

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY package.json package-lock.json* turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY services/pdf/package.json services/pdf/
RUN npm install

COPY services/pdf services/pdf

WORKDIR /app/services/pdf
RUN npm run build

# Drop dev dependencies (keeps express/puppeteer — both are prod deps).
WORKDIR /app
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
# System Chromium + fonts (Arabic/Latin report fonts are embedded by the
# template itself, but base fonts keep Chromium happy).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Use the distro Chromium; skip Puppeteer's own browser download. HOME=/tmp so
# Chromium has a writable profile under OpenShift's arbitrary UID.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/tmp

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json* /app/turbo.json ./
COPY --from=build /app/services/pdf ./services/pdf

# OpenShift / arbitrary-UID compatibility (random non-root UID in group 0).
RUN chgrp -R 0 /app && chmod -R g=u /app

WORKDIR /app/services/pdf
EXPOSE 4100
CMD ["node", "dist/server.js"]
