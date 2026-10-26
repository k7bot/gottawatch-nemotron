# syntax=docker/dockerfile:1.7
# Gottawatch for Nebius: one container serving the phone PWA (/), the browser TV view (/tv/) and the
# API, same origin. Build:  docker build -t gottawatch .
# Run:  docker run -p 8080:8080 -e NEBIUS_API_KEY -v gw-data:/data gottawatch
# Object Storage instead of the volume: -e STORE_MODE=s3 -e SNAPSHOT_BUCKET=... -e S3_ENDPOINT=...
#   -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY (Nebius Object Storage is S3-compatible).

ARG NODE_IMAGE=node:22-bookworm-slim
ARG ESBUILD_VERSION=0.25.12

# ---- 1. Phone web app + bundled API server (root npm workspace) ----
FROM ${NODE_IMAGE} AS web
ARG ESBUILD_VERSION
WORKDIR /src
ENV npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contract/package.json packages/contract/
COPY packages/client/package.json packages/client/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY packages packages
COPY services/api services/api
COPY apps/web apps/web
RUN cd apps/web && VITE_API_URL=same-origin npx vite build
# One self-contained ESM file (AWS SDK S3 client, zod, contract included); no node_modules at runtime.
RUN --mount=type=cache,target=/root/.npm cd services/api && npx -y esbuild@${ESBUILD_VERSION} src/server/main.ts \
      --bundle --platform=node --target=node22 --format=esm --legal-comments=none \
      --banner:js="import { createRequire as __gwRequire } from 'module'; const require = __gwRequire(import.meta.url);" \
      --outfile=/out/server.mjs

# ---- 2. Browser TV view (apps/tv is its own Yarn 4 workspace) ----
FROM ${NODE_IMAGE} AS tv
ENV COREPACK_HOME=/opt/corepack CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=same-origin
RUN corepack enable
WORKDIR /src
COPY packages/contract packages/contract
COPY apps/tv apps/tv
RUN --mount=type=cache,target=/root/.yarn/berry/cache cd apps/tv && yarn install --immutable
RUN cd apps/tv && scripts/export-web.sh /out/tv

# ---- 3. Runtime ----
FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/web TV_DIST=/app/web/tv \
    STORE_MODE=file SNAPSHOT_FILE=/data/state.json
WORKDIR /app
COPY --from=web /out/server.mjs ./server.mjs
COPY --from=web /src/apps/web/dist ./web
COPY --from=tv /out/tv ./web/tv
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Node is PID 1 and handles SIGTERM itself (flushes the snapshot before exit).
CMD ["node", "server.mjs"]
