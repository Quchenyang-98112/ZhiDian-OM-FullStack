# ADR-012: OpenADR 3.1.0 VEN-Client als Frontend Contrib-Adapter

- **Status:** Accepted
- **Datum:** 2026-04-25
- **Autoren:** Nexus-HEMS-Dash Architektur-Team
- **Reviewers:** N/A (Single-Maintainer)

## Kontext

Nexus-HEMS-Dash (v1.1.0) benötigt einen OpenADR 3.1.0 VEN-Client (Virtual End Node) für:
- §14a EnWG Grid-Signale (IMPORT_CAPACITY_SUB)
- Redispatch 2.0 (EXPORT_CAPACITY_SUB)
- Dynamische Tarif-Signale (PRICE, GHG)
- Flex-Bidding (BID_PRICE → OFFERED_DEMAND)

OpenADR 3.1.0 verwendet RESTful JSON (OpenAPI) mit OAuth2 Client-Credential-Flow.

## Entscheidungsfragen

1. Wo soll der OpenADR-Adapter implementiert werden (Frontend vs. Backend)?
2. Wie wird OAuth2 Client-Secret sicher gehandhabt?
3. Wie wird der Adapter in das bestehende Plugin-System integriert?

## Optionen

### Option A: Frontend Contrib-Adapter + API-Backend-Proxy (gewählt)

Der OpenADR31Adapter läuft im Browser als Contrib-Adapter, kommuniziert aber mit dem
OpenADR VTN ausschließlich via `/api/openadr/*`-Backend-Proxy-Routen.

**Vorteile:**
- Konsistent mit bestehender Adapter-Architektur (alle 5+5 Adapter sind Frontend)
- OAuth2 Client-Secret bleibt sicher auf dem API-Server (niemals im Browser-Code)
- Zustandsverwaltung im bestehenden `useEnergyStore` / `useAppStore`
- Adapter-Registry + Plugin-System sofort nutzbar
- Schneller zu implementieren

**Nachteile:**
- Doppelter HTTP-Hop (Browser → API → VTN) statt direktem S2S-Flow
- API-Server muss für außerhalb des Hausnetzwerks erreichbar sein für Webhooks

### Option B: Vollständiger Backend-API-Service

OpenADR-Logik vollständig im `apps/api`-Backend mit eigener Service-Klasse, Frontend
konsumiert nur aggregierte Ergebnisse.

**Vorteile:**
- Korrektere Server-to-Server-Architektur für OAuth2
- Langfristig besser skalierbar

**Nachteile:**
- Erheblicher Mehraufwand (neues Backend-Service-Pattern, neue API-Endpunkte, neues Frontend-
  Store-Management)
- Bricht Konsistenz der Adapter-Architektur
- Schwieriger zu testen (E2E statt Unit-Tests)

## Entscheidung

**Option A wird für v1.2.0 gewählt.**

Begründung:
1. Konsistenz der Architektur ist kritisch für Wartbarkeit
2. OAuth2-Sicherheit ist durch Backend-Proxy ausreichend gelöst
3. v1.2.0-Zeitplan erlaubt keine vollständige Backend-Umstrukturierung
4. Option B ist als Migration für v1.3.0 dokumentiert (ADR-011 referenziert OpenAPI-Migration)

## Konsequenzen

### Positiv
- `OpenADR31Adapter` folgt denselben Patterns wie alle anderen contrib-Adapter
- Volle Integration mit Adapter-Registry, Circuit-Breaker, BaseAdapter-Reconnect
- Test-Muster wiederverwendbar

### Negativ / Risiken
- Webhook-Empfang erfordert öffentlich erreichbaren `apps/api`-Endpunkt (oder lokales Polling
  als Fallback — implementiert als 15-s-Poll wenn Webhook nicht erreichbar)
- Client-Secret muss in `StoredSettings` verschlüsselt gespeichert werden (AES-GCM via
  `ai-keys.ts`-Muster)

## Implementierungshinweise

```typescript
// Adapter-Registrierung in adapter-registry.ts
registerAdapter('openadr-3-1', (config) => new OpenADR31Adapter(config), {
  name: 'OpenADR 3.1.0 VEN-Client',
  version: '1.0.0',
  category: 'integration',
  description: 'OpenADR 3.1.0 Demand Response VEN-Client (DSRSP → HEMS)',
});

// Proxy-Routen in apps/api/src/routes/openadr.routes.ts
POST /api/openadr/token     → VTN OAuth2 Token (Client-Secret auf Server)
GET  /api/openadr/programs  → VTN-Programme weiterleiten
GET  /api/openadr/events    → VTN-Events weiterleiten
POST /api/openadr/reports   → Report an VTN senden
POST /api/openadr/subscriptions → Webhook-Registration
```

## Migration v1.3.0

In v1.3.0 wird OpenADR als Backend-Service migriert (ADR-011-openapi-auto-generation.md):
- `OpenADRService` in `apps/api/src/services/openadr.service.ts`
- Frontend: konsumiert nur aggregierte Events via WebSocket-Push
- Client-Secret wird nie mehr durch Proxy transportiert

---

**Links:**
- [OpenADR 3.1.0 Specification](https://www.openadr.org/openadr-3-0)
- [docs/OpenADR-Integration-Guide.md](../OpenADR-Integration-Guide.md)
- [ADR-011: OpenAPI Auto-Generation](ADR-011-openapi-auto-generation.md)
