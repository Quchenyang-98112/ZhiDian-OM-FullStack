# OpenADR 3.1.0 Integration Guide — VEN-Client für Nexus-HEMS-Dash

Dieses Dokument beschreibt die Integration von OpenADR 3.1.0 in Nexus-HEMS-Dash v1.2.0 als
**VEN-Client** (Virtual End Node). Nexus empfängt Grid-Signale von einem VTN (Virtual Top Node,
z. B. Next Kraftwerke, Tibber, E.ON Flex, Netzbetreiber) und übersetzt diese in lokale
Energiemanagemententscheidungen (§14a EnWG, Redispatch 2.0).

## Übersicht: OpenADR 3.x Versionen

| Version | Veröffentlicht | Änderungen |
|---|---|---|
| OpenADR 2.0b | ~2012 | XML/SOAP, OASIS EI, komplex |
| **OpenADR 3.0** | 2024 | RESTful JSON (OpenAPI), vereinfacht |
| **OpenADR 3.1.0** | Sep 2025 | Program-Objekt, VEN/Resource-API, Webhooks + Message Queues, Event-Prioritäten, Token-Privacy |

**Nexus implementiert OpenADR 3.1.0** (VEN-Client, keine Rückwärtskompatibilität zu 2.0b).

---

## Architektur: Nexus als VEN

```
VTN (Utility / DSO / Aggregator)
   │  HTTPS (OpenAPI 3.1 REST)
   │  OAuth2 Client-Credential
   ▼
apps/api (Express) ── /api/openadr/* (OAuth-Proxy)
   │  intern
   ▼
OpenADR31Adapter (Contrib-Adapter, Browser)
   │  EventBus
   ├── UC26IncentiveTranslator
   ├── MPC-Optimizer (OpenADR-Preissignale)
   └── VPPService (Flex-Bidding, Revenue)
```

**Warum API-Proxy?**
OAuth2 Client-Credential-Flow erfordert ein `client_secret`, das nicht im Browser-Code
gespeichert werden darf. Der Nexus-API-Server fungiert als sicherer Proxy:
- `POST /api/openadr/token` → VTN OAuth-Endpunkt (secret bleibt auf dem Server)
- `GET /api/openadr/programs` → VTN Programme weiterleiten
- `GET /api/openadr/events` → VTN Events weiterleiten
- `POST /api/openadr/reports` → Report an VTN senden

---

## OpenADR 3.1.0 Datenmodell

### Program

```json
{
  "id": "prog-001",
  "programName": "TibberFlex2026",
  "programType": "PRICING_TARIFF",
  "country": "DE",
  "principalSubdivision": "NW",
  "timeZoneOffset": "+01:00",
  "intervalPeriod": { "start": "2026-04-25T00:00:00Z", "duration": "PT24H" },
  "programDescriptions": [{ "URL": "https://tibber.com/de/flex-program" }],
  "bindingEvents": false,
  "localPrice": false,
  "payloadDescriptors": [
    { "payloadType": "PRICE", "units": "KWH", "currency": "EUR" }
  ]
}
```

**Program-Typen (Nexus unterstützt):**
- `PRICING_TARIFF`: Stündliche Preissignale → MPC-Optimizer
- `LOAD_SHEDDING`: DR-Events zur Lastreduzierung → UC 2.6.1
- `PEAK_RESPONSE`: Peak-Shaving-Signale → UC 2.6.3
- `GHG_REDUCTION`: CO₂-Minimierungssignale → grüner Modus

### Event

```json
{
  "id": "evt-042",
  "programID": "prog-001",
  "eventName": "PricePeak",
  "priority": 1,
  "targets": [{ "type": "OADR_REPORT_NAME", "values": ["TELEMETRY_USAGE"] }],
  "intervalPeriod": {
    "start": "2026-04-25T17:00:00Z",
    "duration": "PT3H"
  },
  "intervals": [
    {
      "id": 0,
      "intervalPeriod": { "start": "2026-04-25T17:00:00Z", "duration": "PT1H" },
      "payloads": [{ "type": "PRICE", "values": [0.45] }]
    },
    {
      "id": 1,
      "intervalPeriod": { "start": "2026-04-25T18:00:00Z", "duration": "PT1H" },
      "payloads": [{ "type": "PRICE", "values": [0.52] }]
    },
    {
      "id": 2,
      "intervalPeriod": { "start": "2026-04-25T19:00:00Z", "duration": "PT1H" },
      "payloads": [{ "type": "PRICE", "values": [0.38] }]
    }
  ]
}
```

**Constraint-Event (IMPORT_CAPACITY_SUB — §14a EnWG):**
```json
{
  "id": "evt-043",
  "programID": "prog-14a",
  "eventName": "GridOp14a",
  "priority": 10,
  "intervals": [{
    "id": 0,
    "payloads": [
      { "type": "IMPORT_CAPACITY_SUB", "values": [4200] }
    ]
  }]
}
```

### Report

```json
{
  "programID": "prog-001",
  "eventID": "evt-042",
  "clientName": "nexus-hems-home-01",
  "reportName": "TELEMETRY_USAGE",
  "payloadDescriptors": [{
    "payloadType": "USAGE",
    "readingType": "DIRECT_READ",
    "units": "KWH"
  }],
  "resources": [{
    "resourceName": "home-grid-meter",
    "intervalPeriod": { "start": "2026-04-25T17:00:00Z", "duration": "PT1H" },
    "intervals": [{
      "id": 0,
      "payloads": [
        { "type": "USAGE", "values": [1.23] },
        { "type": "DEMAND_FLEX_MIN", "values": [2.5] },
        { "type": "DEMAND_FLEX_MAX", "values": [7.4] }
      ]
    }]
  }]
}
```

---

## Implementierung: OpenADR31Adapter

### Konfiguration

```typescript
import { OpenADR31Adapter } from '@nexus-hems/web/core/adapters/contrib/OpenADR31Adapter';

const adapter = new OpenADR31Adapter({
  name: 'Tibber Flex VTN',
  host: 'api.tibber.com',
  port: 443,
  tls: true,
  // OAuth2 Client-Credential (gespeichert im Backend, nie im Browser)
  authToken: 'stored-in-backend', // wird via /api/openadr/token geholt
});
```

### Methoden

```typescript
// Programme abrufen
const programs = await adapter.getPrograms();

// Events abrufen (polling, 15 s Interval)
const events = await adapter.getEvents();

// Event bestätigen
await adapter.acknowledgeEvent(eventId, 'opt-in');

// Report einreichen
await adapter.submitReport({
  programID: 'prog-001',
  eventID: 'evt-042',
  demandFlexMin: 2.5,   // kW
  demandFlexMax: 7.4,   // kW
  usage: 1.23,          // kWh
});

// Flex-Bidding (BID_PRICE Event)
await adapter.submitBidPrice(
  offerW: 5000,
  programId: 'prog-001',
  eventId: 'evt-044'
);

// Webhook-Subscription (wenn VTN unterstützt)
await adapter.subscribeWebhook('https://my-hems.local/api/openadr/webhook');
```

### EventBus-Events

```typescript
// Im internen EventBus (apps/web/src/core/adapters/contrib/OpenADR31Adapter.ts)
openadr:program    // Neues/aktualisiertes Programm
openadr:event      // DR-Event empfangen
openadr:constraint // IMPORT_CAPACITY_SUB / EXPORT_CAPACITY_SUB
openadr:report_ack // Report bestätigt
openadr:bid_result // Bidding-Ergebnis (accepted/rejected)
```

---

## §14a EnWG Integration

**§14a EnWG Steuerbare Verbrauchseinrichtungen (ab 14. Januar 2024 vollwirksam):**

- Betrifft: Wärmepumpen, EV-Lader, Klimaanlagen, Speicher >4,2 kW
- Netzbetreiber darf Leistung auf **3,7 kW (Mindestlast)** begrenzen
- Dauer: max. 2 h pro Begrenzungsintervall, max. 3× täglich
- Gegenleistung: Reduzierte Netzentgelte

**Nexus-Umsetzung:**
1. OpenADR31Adapter empfängt `CONSTRAINT/IMPORT_CAPACITY_SUB: 3700` (W)
2. Hohe Priorität (priority=10 im Event) → PeakShavingController übernimmt
3. Alle schaltbaren ESAs werden auf max. 3,7 kW Gesamtbezug begrenzt
4. EVV2GDischargeController deaktiviert Entladung (Netzschutz)
5. Nach Event-Ende: automatische Wiederaufnahme normaler Betrieb
6. Report: tatsächliche Lastsenkung an VTN/Netzbetreiber

---

## Redispatch 2.0 Integration

**Redispatch 2.0** (seit Oktober 2021, §13a EnWG):
- Netzbetreiber kann Einspeisereduzierung oder Lasterhöhung anfordern
- Über OpenADR: `EXPORT_CAPACITY_SUB` (Einspeisebegrenzung) oder `IMPORT_CAPACITY_SUB`

**Nexus-Flow:**
1. `EXPORT_CAPACITY_SUB: 2000` W → PV-Wechselrichter begrenzen (via Modbus)
2. Überschüssige PV-Energie → Batterie/EV laden
3. Report: tatsächliche Exportleistung zurückmelden

---

## Flex-Bidding (BID_PRICE)

**Bidding-Loop (OpenADR 3.1.0 + UC 2.6 Spec v1.0):**

```
VTN sendet BID_PRICE-Event
       ↓
VPPService.calculateTotalFlexCapacity()
  → Inventarisiert: EV (V2G), Batterie (ESS), Wärmepumpe (flexible Last)
       ↓
OpenADR31Adapter.submitBidPrice(offerW, programId, eventId)
  → OFFERED_DEMAND (Min/Max Flex in kW)
       ↓
VTN: ACCEPTED oder REJECTED
       ↓
Bei ACCEPTED: UC26Translator.translateEvent() → DEM-Commands
       ↓
OpenADR Report mit tatsächlicher Flex zurück an VTN
```

---

## Sicherheit

| Aspekt | Implementierung |
|---|---|
| OAuth2 Client-Secret | Nur auf Backend-Server, nie im Browser |
| TLS | TLS 1.2+ (HTTPS), alle VTN-Verbindungen |
| Token-Privacy | VEN sieht nur eigene Programme/Events/Reports |
| Rate Limiting | Max 60 Anfragen/min an Backend-Proxy |
| Input-Validierung | Zod-Schema für alle empfangenen Events |
| Audit-Trail | Alle Events + Reports in IndexedDB gespeichert |
| Webhook-Authentifizierung | HMAC-Signatur-Verifikation (wenn VTN unterstützt) |

---

## Backend API-Proxy-Routen

Die neuen Express-Routen in `apps/api/src/routes/openadr.routes.ts`:

| Route | Methode | Funktion |
|---|---|---|
| `/api/openadr/token` | POST | OAuth2 Token-Request an VTN (Client-Secret bleibt hier) |
| `/api/openadr/programs` | GET | Programmes von VTN weiterleiten |
| `/api/openadr/events` | GET | Events von VTN weiterleiten |
| `/api/openadr/reports` | POST | Report an VTN senden |
| `/api/openadr/subscriptions` | POST/DELETE | Webhook-Subscriptions verwalten |

Alle Routen sind durch `requireJWT` + `requireScope('openadr')` gesichert.

---

*Letzte Aktualisierung: 2026-04-25 | Nexus-HEMS-Dash v1.2.0*
