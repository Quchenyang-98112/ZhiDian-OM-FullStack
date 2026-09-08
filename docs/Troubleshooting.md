# Troubleshooting Guide

This guide covers common issues, debug commands, and log inspection for Nexus-HEMS.

---

## Table of Contents

- [Dev Server Won't Start](#dev-server-wont-start)
- [Adapter Connection Issues](#adapter-connection-issues)
- [WebSocket / Real-Time Data](#websocket--real-time-data)
- [Authentication Errors](#authentication-errors)
- [Build & Type Errors](#build--type-errors)
- [Docker & Container Issues](#docker--container-issues)
- [Tariff / Pricing Issues](#tariff--pricing-issues)
- [Sankey Diagram Not Rendering](#sankey-diagram-not-rendering)
- [Log Inspection](#log-inspection)
- [Debug Commands](#debug-commands)

---

## Dev Server Won't Start

### Symptom: Port 3000 or 5173 already in use

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
pnpm dev
```

### Symptom: "Cannot find module @nexus-hems/shared-types"

The workspace symlink is broken. Reinstall dependencies:

```bash
pnpm install --frozen-lockfile
```

### Symptom: Turbo build cache stale / phantom TS errors

```bash
# Clear all turbo and build caches
pnpm turbo run build --force
rm -rf apps/web/.vite apps/api/dist packages/shared-types/dist
pnpm install
```

### Symptom: "JWT_SECRET not set" on startup

The API requires `JWT_SECRET` in production. For dev, set it in `.env`:

```bash
echo "JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')" >> apps/api/.env
```

---

## Adapter Connection Issues

### Victron MQTT Adapter

**Symptom:** Circuit breaker shows `OPEN`

1. Verify Cerbo GX MQTT is enabled: **Cerbo GX → Settings → Services → MQTT on LAN → Enable**
2. Test connectivity: `mosquitto_sub -h <cerbo-ip> -t '#' -v`
3. Check MQTT port (default: 1883 or 9001 for WebSocket)
4. In Settings → Adapters → Victron, verify the `keepalive` topic responds

**Symptom:** All values are zero / null

- Ensure the correct `systemId` is configured (Victron assigns one per installation)
- Check `N/<systemId>/system/0/Ac/Consumption/L1/Power` in MQTT Explorer

### Modbus / SunSpec Adapter

**Symptom:** "Connection refused" or timeout

```bash
# Test TCP Modbus connectivity (replace IP and port)
nc -zv 192.168.1.100 502
# or with modpoll
modpoll -m tcp -a 1 -r 40001 -c 10 192.168.1.100
```

- Verify the device has Modbus TCP enabled (not just RTU)
- Some devices require the Modbus gateway to be enabled separately
- Default Modbus TCP port is **502**; SMA uses **502**, Fronius uses **502**

### Home Assistant MQTT Adapter

**Symptom:** No entities discovered

1. Verify HA MQTT integration is enabled: **HA → Settings → Devices & Services → MQTT**
2. Check `homeassistant/` discovery topic prefix matches adapter config
3. Test: `mosquitto_pub -h <broker-ip> -t 'homeassistant/sensor/test/config' -m '{}'`
4. Confirm entity IDs are mapped in: Settings → Adapters → Home Assistant → Entity Map

### EEBUS / SHIP Adapter

See full guide: [EEBUS-Certificate-Setup.md](./EEBUS-Certificate-Setup.md)

**Symptom:** mDNS discovery returns no devices

```bash
# Check mDNS resolution
avahi-browse -a -t | grep _ship._tcp
# or on macOS:
dns-sd -B _ship._tcp local.
```

---

## WebSocket / Real-Time Data

### Symptom: Dashboard shows stale data / "Disconnected" banner

1. Open browser DevTools → Network → WS → look for `/ws` connection
2. Check for 401 Unauthorized — JWT token may be expired; hard-refresh the page
3. Check rate limit: `ws-ticket` endpoints allow 10 req/min per IP

**Force reconnect:**
```javascript
// Browser console
window.location.reload();
```

### Symptom: WebSocket closes immediately after connecting

- Verify CORS origin is in the `WS_ORIGINS` env var (production)
- Check nginx `limit_conn 50` wasn't triggered (too many connections from one IP)
- Look for `websocket connections limit reached` in nginx error log

---

## Authentication Errors

### Symptom: 401 on all API endpoints

```bash
# Get a dev token
curl -s -X POST http://localhost:3000/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"dev"}' | jq .accessToken
```

In production, `API_KEYS` env var must be set: `API_KEYS=key1,key2`

### Symptom: "Token revoked" error

The JTI (JWT ID) was added to the revocation list. Log out completely and re-authenticate:
```bash
curl -X POST http://localhost:3000/api/auth/revoke \
  -H "Authorization: Bearer <old_token>"
# Then re-login
```

### Symptom: JWT secret entropy warning in logs

```
WARN: JWT_SECRET appears weak (< 64 chars or common word)
```

Generate a strong secret:
```bash
openssl rand -base64 64
```

---

## Build & Type Errors

### Symptom: TypeScript `TS2307: Cannot find module '@nexus-hems/shared-types'`

```bash
pnpm install     # Ensure workspace symlinks are created
pnpm type-check  # Should resolve after install
```

### Symptom: Biome lint errors blocking commit

```bash
# Auto-fix all Biome issues
pnpm lint:fix
# Then check what remains
pnpm lint
```

### Symptom: `noExplicitAny` error

Replace the `any` type with `unknown`, a precise interface, or a discriminated union. See CLAUDE.md for the project-wide no-`any` policy.

### Symptom: React Compiler `react-compiler/react-compiler` ESLint error

This indicates a hook rule violation that the React Compiler cannot auto-optimize. Fix the component structure or add an explicit `// eslint-disable-next-line react-compiler/react-compiler` with a comment explaining why.

---

## Docker & Container Issues

### Symptom: Container won't start — "permission denied"

The production Dockerfile runs as a non-root user. Check volume permissions:

```bash
docker compose logs api
# If "permission denied on /data/db":
docker compose run --user root api chown -R 1001:1001 /data
```

### Symptom: `ECONNREFUSED` connecting to API from web container

In `docker-compose.yml`, the web service must use the service name, not `localhost`:
```yaml
environment:
  VITE_API_URL: http://api:3000
```

### Symptom: Health check failing in Kubernetes

```bash
kubectl describe pod nexus-hems-api-xxxxx
# Check liveness probe: GET /api/health
curl http://<pod-ip>:3000/api/health
```

---

## Tariff / Pricing Issues

### Symptom: "No price data" in Charts

1. Check Settings → Tariffs → provider is selected and API key is valid
2. Verify the service is reachable from your network:
   ```bash
   curl "https://api.awattar.de/v1/marketdata?start=$(date +%s000)"
   ```
3. Check IndexedDB cache via DevTools → Application → IndexedDB → nexus-hems

### Symptom: MPC optimizer uses wrong prices

- The optimizer caches prices for up to 1 hour. Force refresh: Settings → Optimization → Refresh Prices.
- Check if Tibber "tomorrow" prices were published (only available after ~13:00 CET).

---

## Sankey Diagram Not Rendering

This is a critical component — never modify `SankeyDiagram.tsx` without testing.

**Symptom:** Blank diagram area

1. Open browser DevTools → Console — look for D3 or Sankey layout errors
2. Check that energy data is being received: `useAppStore.getState().energyData`
3. If a Web Worker error appears, check `sankey-worker.ts` for exceptions
4. Verify the Sankey worker is bundled: `dist/assets/sankey-worker-*.js`

**Symptom:** "Cannot read properties of null" in SankeyDiagram

- Usually caused by `energyData` being null at mount time
- The Suspense boundary should cover this; check App.tsx lazy-loading setup

---

## Log Inspection

### API Server Logs

```bash
# Docker
docker compose logs -f api --tail=200

# dev (pnpm)
pnpm --filter @nexus-hems/api dev 2>&1 | grep -E "ERROR|WARN|adapter"

# Structured JSON logs (production)
docker compose logs api | jq 'select(.level == "error")'
```

### Dead Letter Queue

Failed adapter events are written to `apps/api/data/dead-letter.ndjson`:

```bash
tail -f apps/api/data/dead-letter.ndjson | jq .
```

### Client-Side Logs

IndexedDB command audit trail (for hardware commands):

```javascript
// Browser DevTools console
const db = await import('./src/lib/db.ts');
const logs = await db.db.commandAuditLog.orderBy('timestamp').last(50).toArray();
console.table(logs);
```

---

## Debug Commands

```bash
# Full verification pipeline
time pnpm type-check && pnpm lint && pnpm test:run

# Targeted adapter unit tests
pnpm --filter @nexus-hems/web test:run -- --reporter=verbose adapters

# Check for unused i18n keys
pnpm --filter @nexus-hems/web ts-node scripts/check-i18n-keys.ts

# Inspect IndexedDB via CLI (development)
pnpm --filter @nexus-hems/web ts-node -e "
  const { db } = await import('./src/lib/db.ts');
  console.log(await db.settings.toArray());
"

# Check current JWT token from localStorage
# (paste in browser console):
const token = Object.keys(localStorage).filter(k => k.includes('token'));
token.forEach(k => { const p = JSON.parse(atob(localStorage[k].split('.')[1])); console.log(k, p.exp, new Date(p.exp*1000)); });
```

---

*See also: [API-Reference.md](./API-Reference.md) · [Security-Architecture.md](./Security-Architecture.md) · [Adapter-Dev-Guide.md](./Adapter-Dev-Guide.md)*
