# Deployment Guide

Nexus HEMS Dashboard supports three deployment targets: **GitHub Pages** (static SPA), **Docker Compose** (full stack), and **Kubernetes via Helm**.

---

## 1 GitHub Pages (Static SPA)

### Prerequisites

- Repository secret `GITHUB_TOKEN` with `pages: write` and `id-token: write`
- GitHub Pages enabled in repo Settings → Pages → Source: **GitHub Actions**

### Deploy

Trigger the `deploy.yml` workflow manually:

```bash
gh workflow run deploy.yml -f approveDeploy=DEPLOY
```

The workflow builds with `pnpm build` (`NODE_ENV=production`) and deploys the `apps/web/dist/` folder. Assets are served at `https://<user>.github.io/Nexus-HEMS-Dash/`.

The Vite config sets `base: '/Nexus-HEMS-Dash/'` for correct sub-path routing.

---

## 2 Docker Compose (Full Stack)

### Architecture

| Service          | Image                              | Port | Profile      | Purpose                                      |
| ---------------- | ---------------------------------- | ---- | ------------ | -------------------------------------------- |
| `nexus-hems`     | Dockerfile (nginx:1.29-alpine)     | 8080 | default      | SPA + static assets                          |
| `nexus-server`   | Dockerfile.server (node:24-alpine) | 3000 | default      | Express + WebSocket + Prometheus /metrics    |
| `adapter-bridge` | Dockerfile.server                  | —    | default      | Protocol bridge / isolated device-side runtime |
| `prometheus`     | prom/prometheus:v2.53.0            | 9090 | monitoring   | Metrics collection                           |
| `grafana`        | grafana/grafana:11.1.0             | 3001 | monitoring   | Dashboards                                   |
| `alertmanager`   | prom/alertmanager:v0.28.1          | 9093 | monitoring   | Alert routing                                |
| `node-exporter`  | prom/node-exporter:v1.9.0          | 9100 | monitoring   | Host metrics                                 |
| `influxdb`       | influxdb:2.7                       | 8086 | monitoring   | Time-series storage for historical analytics |

### Quick Start

```bash
# Create JWT secret
mkdir -p .secrets
openssl rand -base64 32 > .secrets/jwt_secret

# Start core services
docker compose up -d nexus-hems nexus-server

# Start with monitoring stack
docker compose --profile monitoring up -d
```

### Environment Variables

| Variable                 | Default         | Description                                                                  |
| ------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `PORT`                   | `3000`          | Server listen port                                                           |
| `NODE_ENV`               | `production`    | Environment mode                                                             |
| `JWT_SECRET`             | —               | HMAC-SHA256 secret (min 64 chars, cryptographically random); auto-generated in dev |
| `API_KEYS`               | —               | Comma-separated API keys for `/api/auth/token`; required in production       |
| `API_KEY_SCOPES`         | —               | Comma-separated `key:scope` pairs; required in production (one per `API_KEYS` value) |
| `CORS_ORIGINS`           | —               | Comma-separated allowed CORS origins                                         |
| `WS_ORIGINS`             | —               | Comma-separated allowed WebSocket origins for CSP `connect-src` (production) |
| `RATE_LIMIT_TRUSTED_IPS` | —               | Comma-separated IPs that bypass rate limiting (load balancers, proxies)      |
| `TRUST_PROXY`            | `1`             | Express trust proxy hops or subnet list — **required** behind CDN + reverse proxy so per-IP rate limits see the real client (`loopback,10.0.0.0/8` style); see §2.1 |
| `JWT_SECRET_NEW`         | —               | Optional in-rotation HS256 secret; signing prefers this while old tokens still verify against `JWT_SECRET`; reload via `POST /api/auth/rotate-key` (admin) |
| `JWT_SECRET_NEW_FILE`    | —               | Mounted file path for `JWT_SECRET_NEW` (e.g. Kubernetes rotation) |
| `EEBUS_TRUST_BACKEND`    | `file`          | `file` (JSON via `EEBUS_TRUST_FILE`) or `redis` (requires `REDIS_URL`) for multi-replica API pods |
| `REDIS_URL`              | —               | Optional Redis URL for HA session state: JTI revocation, WS tickets, dashboard shares, EEBUS trust (`redis://host:6379`) |
| `TZ`                     | `Europe/Berlin` | Timezone                                                                     |
| `GRAFANA_PASSWORD`       | **required**    | Grafana admin password — no default; docker-compose fails without it (CRIT-04) |
| `ADAPTER_MODE`           | `mock`          | `mock` for demo data (default); `live` for real protocol adapters — requires `ALLOW_LIVE_HARDWARE=true` |
| `ALLOW_LIVE_HARDWARE`    | unset           | Must be `true` together with `ADAPTER_MODE=live`; without it, effective mode stays `mock` and hardware adapters never start |
| `PROMETHEUS_BEARER_TOKEN`| —               | Bearer token for Prometheus `/metrics` scrape endpoint authentication (optional) |

### Frontend build variables (Vite)

Set at **build time** for production/PWA bundles (`apps/web`):

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `VITE_ADAPTER_MODE` | `mock` | `mock` (default) or `live` |
| `VITE_ALLOW_LIVE_HARDWARE` | unset | Must be `true` with `VITE_ADAPTER_MODE=live` for browser adapters to connect |

Even with live build vars, each adapter must be **enabled manually** in Settings. See `docs/Safety-Certification-Notice.md`.

### Reverse proxy, CDN, and `TRUST_PROXY`

When traffic reaches Node **Cloudflare → corporate Nginx → Express**, the default `trust proxy: 1` makes Express trust only one hop: `req.ip` becomes the **CDN edge IP**, so **all users share one rate-limit bucket**.

Set `TRUST_PROXY` to match your deployment:

| Topology | Example `TRUST_PROXY` value |
| -------- | --------------------------- |
| Single Nginx in front of Node | `1` (default) |
| Nginx + Cloudflare (two trusted hops) | `2` |
| Fixed proxy subnets | `loopback,10.0.0.0/8,172.16.0.0/12` |

Express resolves `req.ip` from `X-Forwarded-For` only for trusted proxy addresses — **do not** parse `X-Forwarded-For` manually in application code. Tune `TRUST_PROXY` so the **rightmost untrusted** hop corresponds to the client IP Express exposes.

### Security

- All containers run as **non-root** with `read_only` filesystem
- `no-new-privileges` security opt enabled
- JWT secret loaded via Docker secrets (`/run/secrets/jwt_secret`)
- tmpfs mounts for nginx cache/run directories
- Auth endpoints (`/api/auth/token`, `refresh`, `revoke`, `rotate-key`) rate-limited to **5 req/min** per IP (brute-force protection)
- Trusted IPs can bypass rate limiting via `RATE_LIMIT_TRUSTED_IPS` env var

### Networks

- **frontend** — Public-facing (nginx)
- **backend** — Internal (server ↔ monitoring)
- **adapters** — Device protocol bridge

---

## 3 Kubernetes (Helm)

### Prerequisites

- Kubernetes 1.28+
- Helm 3.12+
- cert-manager (for TLS)
- nginx ingress controller

### Install

```bash
helm install nexus-hems ./helm/nexus-hems \
  --set ingress.hosts[0].host=hems.example.com \
  --set frontend.image.tag=latest \
  --set server.image.tag=latest
```

### Key Values (`values.yaml`)

| Value                               | Default        | Description               |
| ----------------------------------- | -------------- | ------------------------- |
| `frontend.replicaCount`             | 2              | Frontend replicas         |
| `server.replicaCount`               | 2              | Server replicas           |
| `ingress.enabled`                   | true           | Enable Ingress            |
| `ingress.className`                 | nginx          | Ingress class             |
| `ingress.tls.secretName`            | nexus-hems-tls | TLS certificate secret    |
| `hpa.enabled`                       | true           | Horizontal Pod Autoscaler |
| `hpa.maxReplicas`                   | 8              | Max scale-out             |
| `monitoring.serviceMonitor.enabled` | true           | Prometheus ServiceMonitor |
| `networkPolicy.enabled`             | true           | Restrict pod traffic      |

### Security Defaults

Component-specific pod UIDs (match container base images):

| Component | `runAsUser` | Base image |
|-----------|-------------|------------|
| Server | 65532 | distroless `nodejs24-debian13:nonroot` |
| Frontend | 101 | `nginxinc/nginx-unprivileged` |

Shared container hardening:

- `runAsNonRoot: true`
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- All capabilities dropped (`capabilities.drop: [ALL]`)
- Seccomp profile: `RuntimeDefault`
- PodDisruptionBudget: `minAvailable: 1`

Grype CVE exceptions are documented in `docs/Supply-Chain-Grype-Policy.md` (`.grype.yaml`); no global `only-fixed` bypass.

### Ingress Annotations

WebSocket support and rate limiting are configured automatically:

```yaml
nginx.ingress.kubernetes.io/proxy-read-timeout: '3600'
nginx.ingress.kubernetes.io/proxy-send-timeout: '3600'
nginx.ingress.kubernetes.io/limit-rps: '100'
```

---

## 4 Tauri (Desktop)

Desktop builds are produced by `.github/workflows/tauri-build.yml` (and release automation) via `tauri-apps/tauri-action`. Binaries for Linux (AppImage/deb), macOS (dmg), and Windows (msi/nsis) attach to GitHub Releases.

Configuration: `apps/web/src-tauri/tauri.conf.json`. The Tauri auto-updater is intentionally not enabled — users install new versions by downloading a fresh release.

| Property             | Value |
| -------------------- | ----- |
| Tauri version        | 2.2   |
| Rust edition         | 2024  |
| Minimum rust-version | 1.85  |
| Crate version        | 1.2.0 |

### Build Locally

```bash
cd apps/web && pnpm build && pnpm dlx @tauri-apps/cli@2 build
```

Requires Rust toolchain ≥ 1.85 and platform-specific dependencies (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

---

## 5 nginx Configuration

The production nginx (`nginx.conf`) enforces:

- **Connection limits**: `limit_conn conn_limit 50` per IP (DoS hardening)
- **Rate limiting**: 100 req/min global, 30 req/min for `/api/`
- **Security headers**: HSTS (1 year, preload), CSP, X-Frame-Options: DENY, COOP/CORP, COEP `credentialless`
- **Caching**: `/assets/` → 1 year immutable, `/sw.js` → no-cache
- **Compression**: gzip level 6
- **SPA fallback**: `try_files $uri $uri/ /index.html`
- **Blocked paths**: dotfiles, `.env`, `.git`, lockfiles

> Replace `wss://localhost:*` in CSP `connect-src` with your actual WebSocket origins via the `WS_ORIGINS` env var or nginx `envsubst`.

---

## Health Checks

The server exposes a single health endpoint that includes protocol-adapter status:

```
GET /api/health
```

Response examples (effective mode from `getEffectiveAdapterMode()`):

- Effective `mock` (default, or `ADAPTER_MODE=live` without `ALLOW_LIVE_HARDWARE=true`) → `200 { "status": "healthy", "mode": "mock", "adapters": [] }`
- Effective `live` with no configured adapters in `device-map.json` → `503 { "status": "unhealthy", "mode": "live", "adapters": [] }`
- Effective `live` with all adapters healthy → `200 { "status": "healthy", "mode": "live", "adapters": [...] }`
- Effective `live` with a failed adapter → `503 { "status": "unhealthy", "mode": "live", "adapters": [...] }`

Both the Helm chart (`helm/nexus-hems/templates/deployment-server.yaml`) and `docker-compose.yml` use `/api/health` for liveness and readiness probes. In Kubernetes, a failing readiness probe prevents traffic from reaching pods with dead adapters, avoiding silent degradation.

---

## CI/CD Pipeline

The `ci.yml` workflow runs on every push/PR to `main`:

```
lint-typecheck ─┬── unit-tests ───┐
                ├── build ────────┤── ci-passed
                └── security      │
                                  ├── e2e-tests
                                  └── docker-build
```

Security scanning (`security-full.yml`) runs CodeQL, Semgrep, Gitleaks, Scorecard, and npm audit.
