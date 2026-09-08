# HEMS Protocol Comparison — Stand April 2026

Dieses Dokument vergleicht alle für Nexus-HEMS-Dash relevanten Kommunikationsprotokolle anhand
technischer Kriterien, Marktadoption und Implementierungsstatus (v1.2.0).

## Übersicht

| Protokoll | Version | Transport | Sicherheit | Haupteinsatz | Reife 2026 | Nexus-Status |
|---|---|---|---|---|---|---|
| **Modbus / SunSpec** | SunSpec 103/124/201 | TCP/RTU/REST | TLS optional | PV, Batterie, Zähler, Wechselrichter | Sehr hoch (dominant, >50 % aller Installationen) | ✅ Core-Adapter |
| **MQTT** | 5.0 + Discovery | Pub/Sub WebSocket | TLS + Token | Victron, Home Assistant, Zigbee2MQTT | Hoch | ✅ Victron Core + 3 Contrib |
| **KNX** | KNX/IP (aktuell) | Tunneling/Routing | Keine nativ (Bridge) | Gebäudetechnik, Automation | Hoch (Europa) | ✅ Core-Adapter |
| **OCPP** | **2.1** (2025) + 2.0.1 (IEC 63584:2024) | JSON-RPC over WebSocket | mTLS, Client-Certs, ISO 15118 | EV-Laden, V2X, Smart Charging | Stark wachsend (EU-Pflicht ab 2025) | ✅ Core-Adapter (v1.2.0: BPT vollständig) |
| **EEBUS** | SPINE/SHIP 1.0 | WebSocket + mTLS | TLS 1.3 mTLS | Wärmepumpen, Batterien, Grid-Integration | Stark wachsend (EU-Push 2026) | ✅ Core-Adapter (v1.2.0: SHIP-Wizard) |
| **Matter / Thread** | **1.3** | IP/Thread-Mesh | Matter Security (NOC, ACLs) | Smart-Home-Geräte, ESAs | Emerging (2025/26) | ✅ Contrib-Adapter (v1.2.0: DEM-Cluster) |
| **OpenADR** | **3.1.0** (Sep 2025) | RESTful JSON (OpenAPI) | TLS 1.2+ + OAuth 2 | Grid-to-HEMS Demand Response | Mittel-Hoch (EU/US-Pflicht) | ✅ Contrib-Adapter ab v1.2.0 |

---

## Detaillierte Analyse

### 1. Modbus / SunSpec

**Versionen:**
- Modbus RTU / TCP: Klassisch, weit verbreitet
- **SunSpec Models 103** (PV-Wechselrichter), **124** (Batterie-Steuerung), **201–204** (Smart Meter)

**Transport / Architektur:**
- Modbus RTU: Serial RS-485
- Modbus TCP: Port 502
- SunSpec: HTTP/REST-Bridge (read-only oder read-write)
- Polling-basiert (kein Push)

**Sicherheit:**
- Modbus: Keine nativen Security-Features
- Modbus TCP: TLS über separate Middleware möglich
- SunSpec REST: HTTPS/TLS optional + API-Key

**Stärken:**
- Universell: läuft auf fast allen Wechselrichtern, Batterien, Zählern (Fronius, SMA, BYD, Eastron, etc.)
- SunSpec-Modelle geben semantische Struktur (standardisierte Register-Adressen)
- Einfach, robust, sehr gut dokumentiert
- Dominiert DACH-Installationsmarkt (>50 %)

**Schwächen:**
- Kein Plug & Play / Auto-Discovery (manuelles Mapping von Unit-IDs + Register)
- Keine nativen Grid-Signale oder DR-Fähigkeiten
- Polling-Latenz (typisch 5–30 s)
- Kein Schreib-Schutz ohne Application-Layer-Security

**Zukunft:** Bleibt Backbone für Bestandsgeräte, wird durch EEBUS/Matter für neue Geräte ergänzt.

**Nexus v1.2.0:** `ModbusSunSpecAdapter` — SunSpec Modelle 103/124/201, REST-Bridge, polling 10 s

---

### 2. MQTT (Victron + Home Assistant + Contrib)

**Versionen:** MQTT 3.1.1 / 5.0 (mit Enhanced Authentication, Shared Subscriptions, Message Expiry)

**Transport / Architektur:**
- Pub/Sub over WebSocket (Browser-kompatibel) oder TCP
- Broker: Mosquitto, EMQX, VerneMQ
- Topic-Hierarchien je Hersteller (kein einheitlicher Standard)
- Home Assistant: MQTT Discovery (automatische Entity-Erkennung via `homeassistant/+/config`)

**Sicherheit:**
- TLS 1.2/1.3 + Username/Password oder Client-Certs
- ACL-basierte Topic-Autorisierung im Broker
- MQTT 5.0: Enhanced Auth (Challenge-Response)

**Stärken:**
- Extrem leichtgewichtig (minimaler Overhead)
- Echtzeit-Push (sehr geringe Latenz, <100 ms)
- Große Ökosystem (Victron Cerbo GX, Home Assistant, Zigbee2MQTT, Shelly)
- HA Discovery macht Auto-Konfiguration möglich

**Schwächen:**
- Keine einheitliche Energie-Semantik (jeder Hersteller eigene Topics)
- Discovery allein reicht nicht für semantische Energie-Optimierung
- Kein standardisierter Command-Response-Zyklus

**Nexus v1.2.0:**
- `VictronMQTTAdapter` (Core): Cerbo GX / Venus OS, vollständige Daten-Aggregation
- `HomeAssistantMQTTAdapter` (Contrib): HA MQTT Discovery, bi-direktionaler Sync
- `Zigbee2MQTTAdapter` (Contrib): Zigbee-Geräte via Bridge
- `ShellyRESTAdapter` (Contrib): Shelly Gen1/2/3 via HTTP REST + optional webhook push

---

### 3. KNX

**Versionen:** KNX/IP (aktuell), KNX Classic (TP), KNX RF

**Transport / Architektur:**
- KNX/IP Tunneling: Direkte IP-Verbindung zu KNX/IP-Schnittstellen
- KNX/IP Routing: IP-Multicast für Backbone
- Über knxd WebSocket-Bridge für Browser-Zugriff

**Sicherheit:**
- Keine native Sicherheit in KNX TP/IP
- KNX Secure (ab 2019): AES-128 Verschlüsselung + Authentifizierung (noch wenig verbreitet)
- Nexus: Bridge mit TLS gesichert

**Stärken:**
- De-facto Standard für Gebäudeautomation in Europa
- Sehr stabil, jahrzehntelange Praxisbewährung
- Breite Gerätepalette (Licht, Jalousien, Heizung, Messtechnik)
- Deterministisches Echtzeitverhalten

**Schwächen:**
- Teuer (Zertifizierung, Geräte, Programmierung mit ETS)
- Kein nativer Fokus auf Energie-Optimierung (keine DR-Signale)
- Komplexe Konfiguration, braucht KNX-Fachbetrieb

**Zukunft:** Bleibt Gebäude-Automation-Standard, OpenADR/EEBUS liefern die Energie-Schicht darüber.

**Nexus v1.2.0:** `KNXAdapter` — knxd WebSocket-Bridge, Räume, Temperatur, Licht, Fenster, Floorplan-Integration

---

### 4. OCPP 2.1

**Versionen:**
- OCPP 2.0.1: IEC 63584:2024 (internationaler IEC-Standard)
- **OCPP 2.1** (2025): Erweiterung mit BPT (Bidirectional Power Transfer), DER-Control, generischem Payment

**Transport / Architektur:**
- JSON-RPC über WebSocket (persistent)
- Client = Charging Station (EVSE), Server = CSMS (Charge Station Management System)
- TLS 1.2/1.3 + Client-Certificates für Authentifizierung
- ISO 15118-20 für EV-zu-EVSE-Kommunikation (Plug&Charge, BPT)

**Sicherheit:**
- mTLS: Client-Zertifikate für EVSE-Authentifizierung
- ISO 15118 PKI: V2G Root-CA, OEM-CA, Contract-Cert (für Plug&Charge)
- Security Profile 1/2/3 (Nexus: Profile 2+3)

**Stärken:**
- Smart Charging: dynamische Ladepläne, Laststeuerung, §14a EnWG
- **V2X/BPT (ab 2.1)**: Bidirektionales Laden (V2G/V2H/V2B), DER-Control
- AFIR-kompatibel (EU AFIR: ISO 15118 ab 2026 Pflicht für V2G-Ladepunkte)
- Breite Adoption (Webasto, ABB, go-e, Vestel etc.)
- Plug&Charge: automatische Authentifizierung via ISO 15118

**Schwächen:**
- Sehr komplex (Spec ist 900+ Seiten)
- Hoher Test-Aufwand für Compliance
- CSMS-Implementierung (Server-Rolle) noch nicht in Nexus (v1.3.0-Plan)

**BPT-Parameter (ISO 15118-20, v1.2.0 implementiert):**

| Parameter | Richtung | Einheit | Mandatory |
|---|---|---|---|
| `EVMaximumDischargePower` | EV→EVSE | kW (negativ) | Ja |
| `EVMinimumDischargePower` | EV→EVSE | kW (negativ) | Ja |
| `EVMaximumDischargeCurrent` | EV→EVSE | A (negativ) | Ja |
| `EVMinimumDischargeCurrent` | EV→EVSE | A (negativ) | Ja |
| `EVMaximumV2XEnergyRequest` | EV→EVSE | Wh | Optional (SOC-Guardrail) |
| `EVMinimumV2XEnergyRequest` | EV→EVSE | Wh | Optional (SOC-Floor) |

**Nexus v1.2.0:**
- `OCPP21Adapter` (Core): WebSocket + Client-Certs, Smart Charging, V2X, §14a EnWG
- Neu v1.2.0: Vollständige BPT-Negotiation, DER-Bitmap (AC BPT DER Amendment 1), SOC-Guardrails

---

### 5. EEBUS SPINE/SHIP

**Versionen:** SPINE/SHIP 1.0 (aktiv, kein Major-Update geplant). EU-Push 2026: OpenEEBUS (NIBE 2025), enjoyelec Open-Source-Connector (ElaadNL/FAN).

**Transport / Architektur:**
- SHIP: WebSocket + TLS 1.3 mTLS (Connection Management)
- SPINE: Semantisch-reiches Messaging über SHIP
- mDNS für lokale Device Discovery (kein Cloud-Pairing nötig)
- SKI (Secure Key Identifier) für Device-Authentifizierung

**Sicherheit:**
- TLS 1.3 mTLS (gegenseitige Zertifikatsauthentifizierung)
- SHIP PIN-Verification für initiales Pairing
- Keine Cloud-Abhängigkeit

**Stärken:**
- Semantisch reich (standardisierte Mess- und Steuerprofile für Energie)
- Perfekt für Flexibilitätsmärkte (VDE-AR-E 2829-6, SG-Ready++)
- Grid-Ready: Unterstützt §14a EnWG Load-Control nativ
- Lokale Integration (kein Cloud-Zwang)

**Schwächen:**
- Hoher Setup-Aufwand (Zertifikate, SHIP-Commissioning)
- Noch wenige native Geräte außerhalb DACH (Vaillant aromTHERM, KOSTAL PLENTICORE)
- Kein natives V2X-Profil (über OCPP 2.1 ergänzt)

**Nexus v1.2.0:**
- `EEBUSAdapter` (Core): TLS 1.3 mTLS, SPINE LoadControl (SG Ready 1–4), §14a EnWG
- Neu v1.2.0: **SHIP-Commissioning-Wizard** (mDNS → SKI → PIN → Connected)

---

### 6. Matter / Thread 1.3

**Versionen:** Matter 1.3 (März 2024). Matter 1.4 (geplant 2025): Heat Pumps, Batteries, Solar.

**Transport / Architektur:**
- Matter over IP: Wi-Fi, Ethernet, Thread (802.15.4 IPv6-Mesh)
- CSA-Zertifizierung erforderlich
- Matter Controller (Apple Home / Google Home / Amazon Alexa / Home Assistant)
- REST-Bridge für Browser-Zugriff (kein nativer WASM-Support)

**Sicherheit:**
- NOC (Node Operational Credentials): X.509 Zertifikate
- ACLs auf Cluster-Ebene
- Secure Commissioning (BLE + QR-Code)
- Lokale Kommunikation (kein Cloud-Zwang)

**Energie-Cluster (v1.2.0 implementiert):**

| Cluster | ID | Funktion |
|---|---|---|
| Device Energy Management (DEM) | 0x98 | Steuert Energieverbrauch von ESAs |
| Electrical Power Measurement (EPM) | 0x90 | Leistungsmessung |
| Electrical Energy Measurement (EEM) | 0x91 | Energie-Zählung, Sub-Metering |
| On/Off | 0x0006 | Geräteschalten |
| Thermostat | 0x0201 | Wärmepumpen-Setpoint |

**DEM-Features (v1.2.0 implementiert, FA → CON → STA → PAU → PA Priorität):**
- **FA**: Full Activation (sofortige volle Leistungsabnahme)
- **CON**: Context-Aware Schedule (Zeitfenster-basierte Optimierung)
- **STA**: State Tracking (SoC, ForecastStruct)
- **PAU**: Pause (temporäres Unterbrechen)
- **PA**: Power Adjustment (granulare Leistungsanpassung)
- **PFR**: Power Forecast Response (Forecast für OpenADR-Reporting)

**Stärken:**
- Herstellerübergreifend (CSA-Alliance: Apple, Google, Amazon, Samsung etc.)
- Lokal (kein Cloud-Zwang)
- Wächst schnell (2025/26: erste Energy-Profile-Geräte)
- Perfekte Ergänzung zu OpenADR (HEMS = Translator: OpenADR → Matter DEM)

**Schwächen:**
- Noch jung, Energy-Profile (Matter 1.3/1.4) wenig Geräte
- Browser: nur über REST-Bridge (kein nativer Stack)
- DEM-Zertifizierung erfordert CSA-Memberships

**Nexus v1.2.0:** `MatterThreadAdapter` (Contrib) — DEM, EPM, EEM Cluster, UC 2.6 Translator-Integration

---

### 7. OpenADR 3.1.0

**Versionen:**
- OpenADR 2.0b: XML/SOAP, noch weit verbreitet (Utility-Seite)
- **OpenADR 3.0** (2024): RESTful JSON (OpenAPI), vereinfachte Consumer-Geräte-Integration
- **OpenADR 3.1.0** (Sep 2025): Program-Management, VEN/Resource-Management-API, Push-Mechanismen (Webhooks + Message Queues), Event-Prioritäten, Token-Privacy

**Transport / Architektur:**
- RESTful JSON über HTTPS (OpenAPI 3.1 Spec)
- Rollen: VTN (Virtual Top Node = Utility/DSO/Aggregator), VEN (Virtual End Node = HEMS/Nexus)
- Push: Webhook-Subscriptions (B2B) oder Message Queues (in-home VENs)
- Nexus v1.2.0: Pull-Polling (15 s) + Webhook-Subscription wenn VTN unterstützt, OAuth2 via API-Backend-Proxy

**Sicherheit:**
- OAuth 2.0 Client-Credential Flow
- TLS 1.2+ (HTTPS)
- Token-basierte Object-Privacy (VEN sieht nur eigene Objekte)
- Nexus: OAuth-Token via `/api/openadr/token`-Proxy (Backend schützt Client-Secret)

**OpenADR 3.1.0-Datenmodell (Nexus-implementiert):**

| Objekt | Zweck | Nexus-Methode |
|---|---|---|
| `Program` | Tarif-Metadaten, Scope für Events/Reports | `getPrograms()` |
| `Event` | DR-Signale (PRICE, GHG, CONSTRAINT) | `getEvents()`, `acknowledgeEvent()` |
| `Report` | Flex-Kapazität zurückmelden | `submitReport()` |
| `Subscription` | Webhook-Registrierung | `subscribeWebhook()` |

**Event-Typen (Nexus unterstützt):**
- `PRICE`: stündliche Preissignale (ct/kWh) — OpenADR → MPC-Optimizer
- `GHG`: CO₂-Intensitätssignal (g/kWh) — für grüne Optimierung
- `CONSTRAINT` / `IMPORT_CAPACITY_SUB`: Import-Cap für Peak-Shaving
- `CONSTRAINT` / `EXPORT_CAPACITY_SUB`: Export-Cap für Grid-Stabilisierung
- `BID_PRICE`: Flex-Bidding (Nexus antwortet mit `OFFERED_DEMAND`)

**Stärken:**
- Einfacher REST-API-Ansatz (OpenAPI YAML → Auto-Generate möglich)
- Komplementär zu EEBUS (EEBUS für lokale Geräte, OpenADR für Utility-to-HEMS)
- Perfekt für §14a EnWG und Redispatch 2.0
- Matter-Interworking Spec v1.0 (März 2025): Nexus als HEMS-Translator standardisiert

**Schwächen:**
- VTN-Betreiber (Utility) muss OpenADR 3.x unterstützen (noch wenige in DACH)
- OAuth S2S im Browser problematisch → API-Backend-Proxy notwendig

**Nexus v1.2.0:** `OpenADR31Adapter` (Contrib) — VEN-Client, Program/Event/Report, Flex-Bidding, UC 2.6 Integration

---

## Protokoll-Interaktion in Nexus (v1.2.0)

```
Grid/DSO/Aggregator
       │  OpenADR 3.1.0 (VTN → VEN)
       ▼
 Nexus HEMS ────── EnergyRouter + MPC-Optimizer + UC26Translator
       │
       ├── OCPP 2.1 ──────── Wallbox (ISO 15118-20 BPT) ──── EV (V2G/V2H)
       ├── EEBUS SPINE/SHIP ─ Wärmepumpe (§14a, SG Ready)
       ├── Matter DEM ──────── Smart Home ESAs (EVSE, WP, Batterie)
       ├── Modbus/SunSpec ─── PV-Wechselrichter, Batterie, SmartMeter
       ├── MQTT ────────────── Victron Cerbo GX, Home Assistant
       └── KNX ────────────── Gebäudeautomation (Räume, Licht, Jalousien)
```

---

## Marktreife 2026 (Deutschland / EU)

| Protokoll | Adoption | Standard-Pflicht | Empfehlung |
|---|---|---|---|
| Modbus/SunSpec | ★★★★★ | – | Unverzichtbar (Bestandsgeräte) |
| MQTT | ★★★★☆ | – | Empfohlen für Victron/HA |
| KNX | ★★★★☆ | – | Für Gebäude-Automation |
| OCPP 2.1 | ★★★★☆ | AFIR-Pflicht ab 2026 (V2G) | Pflicht für EV-Anlagen |
| EEBUS | ★★★☆☆ | §14a EnWG empfohlen | Wärmepumpen + Flex-Märkte |
| Matter 1.3 | ★★☆☆☆ | – | Zukunftssicherheit |
| OpenADR 3.1 | ★★☆☆☆ | §14a EnWG, Redispatch 2.0 | Flex-Märkte, VPP |

---

*Letzte Aktualisierung: 2026-04-25 | Version: 1.2.0*
