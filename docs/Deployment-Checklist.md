# Deployment Checklist — Nexus-HEMS-Dash

> Complete checklist for production deployments with TLS, reverse proxy, and failover.

---

## Table of Contents

1. [Pre-Deployment](#pre-deployment)
2. [TLS / HTTPS](#tls--https)
3. [Reverse Proxy (nginx)](#reverse-proxy-nginx)
4. [Docker Production](#docker-production)
5. [GitHub Pages](#github-pages)
6. [Tauri Desktop](#tauri-desktop)
7. [Failover & High Availability](#failover--high-availability)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Rollback Plan](#rollback-plan)

---

## Pre-Deployment

### Build & Quality Gates

- [ ] `node -v` shows Node.js 24.x for production builds
- [ ] `pnpm install --frozen-lockfile` — clean install
- [ ] `pnpm type-check` — no TypeScript errors
- [ ] `pnpm lint` — Biome check + React ESLint (zero warnings, `--max-warnings 0`)
- [ ] `pnpm test:run` — all unit tests green
- [ ] Cloud CI Playwright — all E2E tests green (local runs are Chromium-only and optional)
- [ ] `pnpm test:a11y` or cloud a11y job — accessibility tests passed (WCAG 2.2 AA)
- [ ] `pnpm build` — build successful
- [ ] `pnpm size` — bundle size within limits

### Security Checks

- [ ] `pnpm audit --audit-level=high` — no high/critical vulnerabilities
- [ ] `pnpm security:trojan` — no Trojan-Source characters detected
- [ ] `pnpm security:secrets` — no secrets in code (Gitleaks scan passed)
- [ ] All API keys managed exclusively via encrypted IndexedDB (`ai-keys.ts`)
- [ ] No secrets in `.env`, `docker-compose.yml`, or CI logs

### i18n

- [ ] All new UI strings present in both `apps/web/src/locales/de.ts` **and** `apps/web/src/locales/en.ts`
- [ ] `t()` used for every visible string — no hardcoded display text

---

## TLS / HTTPS

### Initial Certificate Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d hems.example.com \
  --redirect --agree-tos --email admin@example.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### TLS Configuration (nginx)

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
            ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;

# HSTS — 2 years
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
```

### TLS Checklist

- [ ] TLS 1.2+ enforced (no TLS 1.0/1.1)
- [ ] HSTS header set (minimum 1 year)
- [ ] OCSP Stapling enabled
- [ ] HTTP → HTTPS redirect configured
- [ ] Certificate renewal cron job active
- [ ] SSL Labs test: **A+** rating → https://ssllabs.com/ssltest/

---

## Reverse Proxy (nginx)

### Production Configuration

```nginx
upstream hems_backend {
    server 127.0.0.1:3001;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name hems.example.com;

    ssl_certificate     /etc/letsencrypt/live/hems.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hems.example.com/privkey.pem;

    root /var/www/nexus-hems/dist;
    index index.html;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "0" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    # CSP is embedded in apps/web/index.html with a Vite-injected nonce.
    # Do not add a conflicting nginx CSP header unless nginx also injects matching nonces.

    # SPA Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://hems_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # WebSocket Proxy (MQTT-over-WS, KNX, OCPP)
    location /ws/ {
        proxy_pass http://hems_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    # Static Assets — Long Cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service Worker — No Cache
    location = /sw.js {
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}

# HTTP → HTTPS Redirect
server {
    listen 80;
    server_name hems.example.com;
    return 301 https://$host$request_uri;
}
```

### Reverse Proxy Checklist

- [ ] WebSocket upgrade configured for `/ws/`
- [ ] Proxy timeout ≥ 24 h for long-lived WebSocket connections
- [ ] Security headers set (CSP, HSTS, X-Frame-Options, COEP `credentialless`)
- [ ] SPA fallback `try_files $uri /index.html`
- [ ] Service Worker `sw.js` served without cache
- [ ] Static assets with `Cache-Control: immutable`
- [ ] Gzip/Brotli enabled
- [ ] `limit_conn conn_limit 50` set (nginx per-IP connection limit)

---

## Docker Production

### docker-compose.yml (Production)

```yaml
services:
  nexus-hems:
    image: ghcr.io/qnbs/nexus-hems-dash:5.0.0
    # Optional immutable pin:
    # image: ghcr.io/qnbs/nexus-hems-dash@sha256:<digest>
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '3001:80'
    read_only: true
    tmpfs:
      - /tmp
      - /var/cache/nginx
      - /var/run
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost/']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 256M
```

### Docker Checklist

- [ ] Multi-stage build (Node → nginx)
- [ ] `read_only: true` — read-only filesystem
- [ ] `no-new-privileges: true`
- [ ] Non-root user (`nginx`)
- [ ] Healthcheck configured
- [ ] Resource limits set (CPU, RAM)
- [ ] No secrets in image or `docker-compose.yml`
- [ ] OCI image metadata set (`org.opencontainers.image.*`)
- [ ] Production deploy prefers immutable digest over mutable tag
- [ ] Container image scan passed (Grype or Snyk)
- [ ] `restart: unless-stopped` for auto-recovery
- [ ] `JWT_SECRET` set as Docker secret (minimum 64 chars, cryptographically random)
- [ ] `API_KEYS` set (minimum 1 key, generated via `openssl rand -hex 32`)
- [ ] `API_KEY_SCOPES` set with explicit `key:scope` binding for every API key (`read`, `readwrite`, or `admin`)
- [ ] `REDIS_URL` set when running multiple API replicas (`redis://redis:6379` in `docker-compose.prod.yml`)
- [ ] `GRAFANA_PASSWORD` set — required (no default, compose fails without it)
- [ ] `WS_ORIGINS` set (own WebSocket origins only, no `ws://localhost:*` in production)
- [ ] `RATE_LIMIT_TRUSTED_IPS` configured for internal load balancers/proxies (optional)
- [ ] `PROMETHEUS_BEARER_TOKEN` set for Prometheus scrape endpoint authentication (optional)

---

## GitHub Pages

### Deployment

```bash
# Manual trigger via .github/workflows/deploy.yml
# GitHub Actions → Deploy → Run workflow
# Input: approveDeploy=DEPLOY
```

### GitHub Pages Checklist

- [ ] `base: '/Nexus-HEMS-Dash/'` in `apps/web/vite.config.ts`
- [ ] `public/404.html` with SPA redirect present
- [ ] `public/manifest.json` correct `start_url` + `scope`
- [ ] `public/robots.txt` up to date
- [ ] Deploy only after explicit manual approval (`approveDeploy=DEPLOY`)
- [ ] CNAME file for custom domain (if applicable)
- [ ] HTTPS enforced in GitHub Pages settings

---

## Tauri Desktop

### Build Checklist

- [ ] `apps/web/src-tauri/tauri.conf.json` — CSP correct (Trusted Types)
- [ ] All 3 platforms tested (Linux, macOS, Windows)
- [ ] `.github/workflows/tauri-build.yml` passes successfully

> Note: Tauri auto-updater is intentionally **not** wired up. Users update by downloading a new release. See `docs/Safety-Certification-Notice.md` §6.

---

## Failover & High Availability

### Adapter Failover

```
Adapter connection failed
    ↓
Exponential Backoff (1s → 2s → 4s → ... → 30s max)
    ↓ ±25% Jitter
Max 10 Retries
    ↓
Circuit Breaker OPEN (30s cooldown)
    ↓
Half-Open Probe
    ↓ Success → CLOSED
    ↓ Failure → OPEN (again)
```

### Offline Fallback (PWA)

1. **Service Worker** (Workbox) caches all static assets
2. **IndexedDB** (Dexie.js) caches the latest energy data + settings
3. **Background Sync** synchronizes pending commands on reconnect
4. **OfflineBanner** displays offline status to the user

### DNS Failover (optional)

```
hems.example.com → Primary (192.168.1.100)
                  → Fallback (192.168.1.101)

# Cloudflare Load Balancer or DNS Round-Robin
```

### Multi-Adapter Redundancy

- Victron MQTT + Modbus SunSpec can be configured in parallel
- On adapter failure: automatic fallback to remaining active adapters
- `useEnergyStore` merges all active adapter data via `deepMergeModel()`

### Failover Checklist

- [ ] Circuit breaker configured per adapter
- [ ] Exponential backoff with jitter
- [ ] Offline cache (Dexie.js) functional
- [ ] Background sync tested
- [ ] Service worker pre-cache up to date
- [ ] DNS failover configured for multi-server setups
- [ ] Monitoring/alerting for adapter status

---

## Post-Deployment Verification

### Smoke Tests

- [ ] Dashboard loads correctly (`/`)
- [ ] All navigation routes reachable
- [ ] Sankey diagram renders (D3.js)
- [ ] KNX floorplan renders
- [ ] PWA installable
- [ ] Service worker registered
- [ ] Offline mode works (airplane mode test)
- [ ] Language switching DE ↔ EN works

### Performance

- [ ] Lighthouse: Performance ≥ 85%, A11y ≥ 90%, Best Practices ≥ 90%
- [ ] First Contentful Paint < 2 s
- [ ] Total Blocking Time < 300 ms
- [ ] CLS < 0.1

### Monitoring

- [ ] Prometheus metrics reachable (`/metrics`)
- [ ] Adapter health checks green
- [ ] Error tracking active (Sentry / Custom)
- [ ] Grafana dashboards loading correctly (if monitoring profile enabled)

---

## Rollback Plan

### GitHub Pages

```bash
# Restore last working deployment
git revert HEAD
git push origin main
# → deploy.yml builds and deploys automatically
```

### Docker

```bash
# Switch to previous image
docker compose down
docker tag nexus-hems-dash:latest nexus-hems-dash:rollback
docker pull nexus-hems-dash:previous
docker compose up -d

# Or: docker service rollback
docker service update --rollback nexus-hems
```

### Helm / Kubernetes

```bash
# Find last successful revision
helm history nexus-hems -n nexus

# Roll back to revision 12
helm rollback nexus-hems 12 -n nexus

# Alternatively at deployment level
kubectl rollout undo deploy/nexus-hems-server -n nexus
kubectl rollout undo deploy/nexus-hems-frontend -n nexus
```
