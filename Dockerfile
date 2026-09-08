# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:24.15.0-alpine3.22@sha256:b689d4005875ae167178471a7a622ec2909459a3bbb32277260be1971af7a99f AS build

WORKDIR /app

# Install deps first (layer cache)
# Copy all workspace manifests so pnpm resolves sub-packages correctly
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ai-core/package.json ./packages/ai-core/
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

# Copy source & build
COPY . .
RUN pnpm --filter @nexus-hems/web build

# ── Stage 2: Serve with nginx (unprivileged) ──────────────────
# nginxinc/nginx-unprivileged runs as non-root user (uid 101 / nginx) by
# default — reduced attack surface vs the official nginx image.
# NOTE: Pin to an immutable SHA256 digest in production via build-arg or
# image policy (e.g. Kyverno imagePolicyWebhook).
# Pin OCI index digest (multi-arch) — satisfies OpenSSF Scorecard Pinned-Dependencies
# Immutable tag + digest satisfies OpenSSF Pinned-Dependencies.
FROM nginxinc/nginx-unprivileged:1.31-alpine-slim@sha256:ee7751c78fd1a51a8c12ac5a0ab15b2de2d486df155ef95bf52db9cef7de0d2d AS production

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG VERSION=dev

LABEL org.opencontainers.image.title="Nexus-HEMS Dashboard Frontend" \
  org.opencontainers.image.description="Production frontend image for Nexus-HEMS-Dash" \
  org.opencontainers.image.source="https://github.com/qnbs/Nexus-HEMS-Dash" \
  org.opencontainers.image.revision="$VCS_REF" \
  org.opencontainers.image.created="$BUILD_DATE" \
  org.opencontainers.image.version="$VERSION"

# Security: upgrade all OS packages to fix CVEs (libxml2, openssl, libpng, etc.)
# Base image runs as uid 101 (nginx) — switch to root for apk, then drop back.
USER root
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

# Security: nginx-unprivileged already creates a non-root 'nginx' user (uid 101).
# No need to create a separate app user.

# Copy custom nginx config template
COPY --chown=nginx:nginx apps/web/nginx.conf /etc/nginx/templates/nexus-hems.conf.template

# MED-03: Custom entrypoint validates WS_ORIGINS before nginx starts.
# Delegates to /docker-entrypoint.sh (the base image's envsubst processor)
# only when WS_ORIGINS contains safe characters.
COPY --chown=nginx:nginx --chmod=755 apps/web/docker-entrypoint.sh /docker-entrypoint-validate.sh

# Copy built assets from build stage
COPY --chown=nginx:nginx --from=build /app/apps/web/dist /usr/share/nginx/html

# MED-03: nginx official image processes /etc/nginx/templates/*.template via envsubst
# at startup — WS_ORIGINS env var is injected into the CSP connect-src header.
# Default: WS_ORIGINS="wss://localhost:8081" (safe fallback for dev/compose; override in prod)
ENV WS_ORIGINS="wss://localhost:8081"

# Security headers are in nginx.conf
# Health check for orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/ || exit 1

EXPOSE 8080

# Security: nginx-unprivileged defaults to nginx user (uid 101)
USER nginx

ENTRYPOINT ["/docker-entrypoint-validate.sh"]
CMD ["nginx", "-g", "daemon off;"]
