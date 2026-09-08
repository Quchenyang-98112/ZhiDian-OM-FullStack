# EU AFIR V2G Compliance-Checkliste

**EU AFIR** (Alternative Fuels Infrastructure Regulation, EU 2023/1804) verpflichtet Betreiber
von öffentlich zugänglichen Lade-Infrastrukturen zu ISO 15118-20 und bidirektionalem Laden.
Diese Checkliste gilt für Nexus-HEMS-Dash v1.2.0 und private/semi-öffentliche V2G-Anlagen.

## Zeitplan

| Datum | AFIR-Anforderung |
|---|---|
| **Jan 2026** | Alle neuen AC Mode-3-Ladepunkte: ISO 15118 Pflicht |
| **Jan 2026** | V2G-fähige Ladepunkte: ISO 15118-20 BPT Pflicht |
| **Jan 2027** | Alle neuen DC-Ladepunkte: ISO 15118-20 |
| **Jan 2028** | Alle neuen Mode-2-Kabel: ISO 15118 Digital Com |

---

## Compliance-Matrix

### ISO 15118-20 BPT-Pflichtanforderungen

| Anforderung | Status | Nexus-Umsetzung |
|---|---|---|
| ChargeParameterDiscovery mit BPT-Profilen | ✅ v1.2.0 | `OCPP21Adapter.sendBPTChargeParameterDiscovery()` |
| EVMaximumDischargePower (negativ) | ✅ v1.2.0 | `BPTNegotiationParams.evMaximumDischargePower` |
| EVMinimumDischargePower (negativ) | ✅ v1.2.0 | `BPTNegotiationParams.evMinimumDischargePower` |
| EVMaximumDischargeCurrent (negativ) | ✅ v1.2.0 | `BPTNegotiationParams.evMaximumDischargeCurrent` |
| EVMinimumDischargeCurrent (negativ) | ✅ v1.2.0 | `BPTNegotiationParams.evMinimumDischargeCurrent` |
| EVMaximumV2XEnergyRequest (SOC-Guard) | ✅ v1.2.0 | `BPTNegotiationParams.evMaximumV2XEnergyRequest` |
| EVMinimumV2XEnergyRequest (SOC-Floor) | ✅ v1.2.0 | `BPTNegotiationParams.evMinimumV2XEnergyRequest` |
| ScheduleExchange Dynamic Control Mode | ✅ v1.2.0 | `OCPP21Adapter.sendScheduleExchange()` |
| Ramp-Rate ≤ 20 A/s (CharIN Guide 2.0) | ✅ v1.2.0 | `OCPP21Adapter.sendBPTDischargeProfile()` |
| Plug&Charge (eMAID-Token, ISO 15118) | ✅ v1.1.0 | `OCPP21Adapter` iso15118Enabled + eMAID |
| mTLS Client-Certificates | ✅ v1.1.0 | `AdapterConnectionConfig.clientCert/clientKey` |

### AC BPT DER Amendment 1 (erwartet Q2 2026)

| Anforderung | Status | Nexus-Umsetzung |
|---|---|---|
| ServiceID 8 (AC BPT DER) | ✅ v1.2.0 | `OCPP21Adapter.parseDERBitmap()` |
| 8-Bit DER-Bitmap | ✅ v1.2.0 | Bit 0–7 ausgewertet |
| Discharge mode support (Bit 1) | ✅ v1.2.0 | DER-Bitmap-Handling |
| Reactive Power Setpoint (Bit 6) | ✅ v1.2.0 | DER-Bitmap-Handling |
| Grid-Code-Settings | ⏳ Amendment noch nicht final | Vorbereitet, aktivierbar nach Final-Spec |

### OCPP 2.1 Smart Charging

| Anforderung | Status | Nexus-Umsetzung |
|---|---|---|
| SetChargingProfile mit negativen Limits | ✅ v1.2.0 | `sendBPTDischargeProfile()` |
| BidirektionalPowerTransfer Feature-Bit | ✅ v1.2.0 | In OCPP-Verbindungs-Handshake |
| DER-Control Commands | ✅ v1.2.0 | DER-Bitmap → OCPP DER-Commands |
| §14a EnWG Import-Cap-Enforcement | ✅ v1.2.0 | OpenADR IMPORT_CAPACITY_SUB Mapping |

---

## CharIN Interoperability Guide 2.0 — DC BPT

| Item | Requirement | Status |
|---|---|---|
| CI-01 | EVMax/MinDischargePower mandatory | ✅ Implementiert |
| CI-02 | EVMax/MinDischargeCurrent mandatory | ✅ Implementiert |
| CI-03 | Negative Power-Values für Discharge | ✅ EV-Werte im Exponent+Value-Format |
| CI-04 | V2X Energy-Requests optional aber empfohlen | ✅ Optional in BPTNegotiationParams |
| CI-05 | Ramp-Rate ≤ 20 A/s bei Shutdown | ✅ `rampRateAperS` default 20 |
| CI-06 | Dynamic Control Mode (real-time) | ✅ ScheduleExchange implementiert |
| CI-07 | ChargeProgress: Start / Stop | ✅ PowerDelivery implementiert |

---

## §14a EnWG Compliance

| Anforderung | Status | Nexus-Umsetzung |
|---|---|---|
| Steuerbare Verbrauchseinrichtung >4,2 kW | ✅ | EV-Lader, WP werden gesteuert |
| Begrenzung auf 3,7 kW (Mindestlast) | ✅ v1.2.0 | OpenADR IMPORT_CAPACITY_SUB: 3700 |
| Max. 2 h Begrenzungsdauer | ✅ | Event-Dauer aus OpenADR-Event |
| Max. 3× täglich | ✅ | Event-Counter in VPPService |
| Netzbetreiber-Meldung (§14a, Abs. 3) | ⏳ | Manuell (OpenADR-Report = Proxy) |
| Netzentgelt-Rabatt-Abrechnung | ⏳ | Manuell via VPP Revenue-Panel |

---

## Nexus-spezifische Sicherheits-Compliance

| Aspekt | Status |
|---|---|
| SOC-Guardrail (min. 20 % Hard-Stop) | ✅ v1.2.0 |
| SOC-Guardrail Konfigurierbar (Nutzer-seitig) | ✅ v1.2.0 |
| Audit-Trail aller V2G-Commands (IndexedDB) | ✅ v1.1.0+ |
| Command-Safety-Layer (Zod, Rate-Limit) | ✅ v1.1.0 |
| Doppelbestätigung für Discharge-Commands | ✅ v1.1.0 |

---

## Nicht in Scope (Hardware-Abhängig)

Die folgenden Anforderungen erfordern echte EVSE-Hardware und sind **nicht im Software-Stack**
testbar:

| Aspekt | Warum nicht in Scope |
|---|---|
| V2G Root-CA Zertifikat | Physische PKI-Infrastruktur |
| OEM-CA / Contract-Cert (Plug&Charge) | Fahrzeughersteller-PKI |
| EXI-Encoding (ISO 15118 XML → Binär) | Hardware-EVSE-Level |
| ISO 15118 Security-Profile-Test | EVSE + EV-Kombination |
| CharIN Plugfest-Zertifizierung | Physische Hardware-Tests |

---

## Weitere Quellen

- [ISO 15118-20:2022](https://www.iso.org/standard/77845.html)
- [CharIN Interoperability Guide 2.0 DC BPT](https://www.charinev.org)
- [EU AFIR (EU 2023/1804)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1804)
- [OpenADR Alliance](https://www.openadr.org)
- [ElaadNL V2G Implementation Guide 2025](https://www.elaad.nl)

---

*Letzte Aktualisierung: 2026-04-25 | Nexus-HEMS-Dash v1.2.0*
