/**
 * Server Entry Point — Thin Wrapper
 *
 * All server logic has been decomposed into modular files:
 *
 *   src/server/
 *   ├── index.ts              (Express + WS setup, route registration)
 *   ├── middleware/
 *   │   ├── auth.ts           (JWT middleware, API key validation, WS auth)
 *   │   ├── security.ts       (Helmet CSP, CORS, rate limiting)
 *   │   └── metrics.ts        (Prometheus metrics engine)
 *   ├── routes/
 *   │   ├── auth.routes.ts    (/api/auth/token, /api/auth/refresh, /api/health)
 *   │   ├── eebus.routes.ts   (/api/eebus/discover, /api/eebus/pair)
 *   │   ├── metrics.routes.ts (/metrics, /api/metrics/json)
 *   │   └── grafana.routes.ts (/api/grafana/dashboard)
 *   ├── ws/
 *   │   └── energy.ws.ts      (WebSocket handler, rate limiting, broadcasts)
 *   └── data/
 *       └── mock-data.ts      (Mock data generator, ADAPTER_MODE env var)
 *
 * Security improvements over monolithic server.ts:
 *   - /api/auth/token now validates API keys in production (API_KEYS env var)
 *   - /metrics, /api/eebus/*, /api/grafana/* protected by JWT middleware
 *   - Production CSP no longer allows ws://localhost:* (use WS_ORIGINS env var)
 *   - /api/health remains unauthenticated (load balancer requirement)
 */
import { startServer } from './src/index.js';

startServer();
