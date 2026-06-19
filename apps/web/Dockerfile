# Web image (multi-stage) — build from the repo root:
#   docker build -f apps/web/Dockerfile .
# Stage 1 builds the Next.js app with the full workspace; stage 2 ships only the
# production deps + build output (devDeps, sources, and build caches dropped).

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

COPY packages/types packages/types
COPY apps/web apps/web

# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app/apps/web
RUN npm run build

# Drop dev dependencies (keeps next/react — both are prod deps).
WORKDIR /app
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/app \
    npm_config_cache=/tmp/.npm

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json* /app/turbo.json ./
COPY --from=build /app/packages/types ./packages/types
COPY --from=build /app/apps/web ./apps/web

# OpenShift / arbitrary-UID compatibility (random non-root UID in group 0).
# Next.js writes its image-optimization cache under .next/cache at runtime.
RUN chgrp -R 0 /app && chmod -R g=u /app

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
