# V2G Integration Guide — ISO 15118-20 BPT & OCPP 2.1

Dieses Dokument beschreibt die vollständige V2G-Integration (Vehicle-to-Grid / Vehicle-to-Home)
in Nexus-HEMS-Dash v1.2.0. Es umfasst ISO 15118-20 BPT-Parameter, OCPP 2.1 Mapping,
SOC-Guardrails, AFIR-Compliance und den EVV2GDischargeController.

## Übersicht

V2G ermöglicht das bidirektionale Laden von Elektrofahrzeugen:
- **V2G** (Vehicle-to-Grid): Energie ins öffentliche Netz einspeisen
- **V2H** (Vehicle-to-Home): Haushalt aus dem EV versorgen (Notstrom, Eigenverbrauch)
- **V2B** (Vehicle-to-Building): Gebäude aus dem EV versorgen

Ab **EU AFIR Januar 2026** ist ISO 15118-20 für alle neu installierten V2G-fähigen Ladepunkte
(AC Mode 3 und DC) **gesetzlich vorgeschrieben**.

---

## ISO 15118-20 BPT-Parameter

### ChargeParameterDiscovery (Capabilities-Negotiation)

Das EV sendet beim Verbindungsaufbau seine Lade-/Entlade-Fähigkeiten. Alle Power/Current-Werte
verwenden das **Rational-Format**: `value × 10^exponent`.

**Negative Werte = Entladung (Discharge).**

#### DC BPT (CharIN Guide 2.0 — Hauptprofil 2026)

**Pflichtparameter (EV → EVSE, ChargeParameterDiscoveryReq):**

| Parameter | Typ | Einheit | Vorzeichen | Beispiel |
|---|---|---|---|---|
| `EVMaximumChargePower` | Rational | kW | positiv | `exp=4, val=1` → 10 kW |
| `EVMinimumChargePower` | Rational | kW | positiv | `exp=4, val=5` → 50 kW |
| `EVMaximumChargeCurrent` | Rational | A | positiv | `exp=4, val=3` → 3 kA |
| `EVMinimumChargeCurrent` | Rational | A | positiv | `exp=2, val=1` → 100 A |
| `EVMaximumVoltage` | Rational | V | positiv | `exp=0, val=360` → 360 V |
| `EVMinimumVoltage` | Rational | V | positiv | `exp=0, val=310` → 310 V |
| **`EVMaximumDischargePower`** | Rational | kW | **negativ** | `exp=5, val=-1` → -10 MW |
| **`EVMinimumDischargePower`** | Rational | kW | **negativ** | `exp=5, val=-1` → -10 MW |
| **`EVMaximumDischargeCurrent`** | Rational | A | **negativ** | `exp=2, val=-4` → -400 A |
| **`EVMinimumDischargeCurrent`** | Rational | A | **negativ** | `exp=2, val=-3` → -300 A |

**Optionale Parameter (SOC-Guardrails):**

| Parameter | Typ | Einheit | Bedeutung |
|---|---|---|---|
| **`EVMaximumV2XEnergyRequest`** | Rational | Wh | Maximale V2X-Energie (verhindert Überentladung) |
| **`EVMinimumV2XEnergyRequest`** | Rational | Wh | Minimale V2X-Energie (SOC-Floor, z. B. 10 kWh Reserve) |

> **Sicherheitsregel:** `EVMinimumV2XEnergyRequest` muss immer gesetzt werden um unbeabsichtigte
> Tiefentladung zu verhindern. Nexus-Default: 20 % des Batterie-Nennkapazität.

#### AC BPT DER (Amendment 1 — ~Q1 2026)

Neuer ServiceID 8 (`V2G_CI_AC 2.0`). Erweitert AC BPT um DER-Funktionen (Volt-Var, Droop,
Power-Factor-Regelung). 8-Bit-Bitmap in `ServiceDetailRes` / `ChargeParameterDiscoveryReq`:

| Bit | Funktion |
|---|---|
| 0 | Charge mode support |
| 1 | **Discharge mode support** |
| 2 | Galvanic isolation (disconnect/reconnect) |
| 3 | Authorization to discharge |
| 4 | Fixed Power-Factor (absorbing) |
| 5 | Fixed Power-Factor (injecting) |
| 6 | Reactive Power Setpoint |
| 7 | Charge Setpoint (% von Max) |

### ScheduleExchange (Energy-Request & Timing)

```json
{
  "departureTime": 3600,
  "EVTargetEnergyRequest": { "exponent": 3, "value": 25 },
  "EVMaximumEnergyRequest": { "exponent": 3, "value": 40 },
  "EVMinimumEnergyRequest": { "exponent": 3, "value": 10 },
  "Dynamic_SEReqControlMode": {}
}
```

- `departureTime`: Sekunden bis geplante Abfahrt (0 = sofort, 3600 = 1 h)
- `Dynamic_SEReqControlMode`: Aktiviert real-time BPT (kein fester Schedule)

### PowerDelivery (Dynamic Control Mode)

Im Dynamic Control Mode kann der EVSE die Leistung in Echtzeit anpassen:
- Ramp-down ≤ **20 A/s** (CharIN Spec, Sicherheitsanforderung)
- `ChargeProgress`: `Start`, `Stop` (Pause → Stop in CharIN Guide 2.0)

---

## OCPP 2.1 — BPT-Mapping

Nexus übersetzt ISO 15118-20-BPT-Parameter in OCPP 2.1 `SetChargingProfile`-Befehle:

```typescript
// ISO 15118-20 BPT → OCPP 2.1 SetChargingProfile
{
  "chargingProfileId": 1,
  "chargingProfileKind": "Absolute",
  "chargingProfilePurpose": "TxProfile",
  "chargingSchedule": [{
    "duration": 3600,
    "startSchedule": "2026-04-25T12:00:00Z",
    "chargingSchedulePeriod": [
      { "startPeriod": 0, "limit": -7400 },   // Discharge: -7.4 kW (negativ)
      { "startPeriod": 1800, "limit": 11000 }  // Charge: +11 kW
    ],
    "minChargingRate": -7400,
    "maxChargingRate": 11000
  }]
}
```

**Wichtig:** Negative `limit`-Werte = Entladung. OCPP 2.1 unterstützt dies nativ durch das
`Bidirektional Power Transfer` Feature-Bit.

---

## EVV2GDischargeController

Der `EVV2GDischargeController` ist ein neuer Controller im `ControllerPipeline` (Priority: `high`).

### Entladungslogik

```
Bedingungen für Entladung:
1. EV verbunden + V2X-fähig (v2xCapable = true)
2. EV-SOC > minV2XSocPercent (Default: 30 %)
3. Aktueller Strompreis > dischargeThresholdEurKWh (Default: 0.25 €/kWh)
   ODER OpenADR CONSTRAINT-Event aktiv (IMPORT_CAPACITY_SUB)
4. Kein §14a EnWG Grid-Curtailment aktiv
5. BPT-Parameter vorhanden (bptParams.EVMaximumDischargePower != null)

Entladeleistung = min(
  abs(bptParams.EVMaximumDischargePower),
  (evSocPercent - minV2XSocPercent) * capacityW / 100,
  openADRConstraint.importCapW ?? Infinity
)
```

### Einstellungen (StoredSettings)

```typescript
interface V2GControllerSettings {
  enabled: boolean;
  minV2XSocPercent: number;        // Default: 30 (SOC-Floor in %)
  dischargeThresholdEurKWh: number; // Default: 0.25 (Preisschwelle)
  maxDischargePowerW: number;       // Default: 7400 (7.4 kW, Standard-Wallbox)
  rampRateAperS: number;            // Default: 20 (CharIN Spec)
  honorOpenADRConstraints: boolean; // Default: true
  honor14aEnWGCurtailment: boolean; // Default: true
}
```

---

## SOC-Guardrails

SOC-Guardrails verhindern die unbeabsichtigte Tiefentladung des EV-Akkus:

| Guardrail | Default | Beschreibung |
|---|---|---|
| `minV2XSocPercent` | 30 % | Minimaler SOC während V2G-Session |
| `EVMinimumV2XEnergyRequest` | 20 % von Kapazität | ISO 15118-20 Mindestenergie |
| Hard Stop | 20 % | Erzwungener Stop unabhängig von Einstellungen |

**Implementierung:**
```typescript
// SOC-Guardrail-Check (wirft Fehler bei Verletzung)
if (evSocPercent < minV2XSocThreshold) {
  throw new Error(
    `V2X SOC-Guardrail verletzt: EV-SOC ${evSocPercent}% < Minimum ${minV2XSocThreshold}%`
  );
}
```

---

## AFIR-Compliance-Checkliste

Für EU AFIR-konforme V2G-Ladepunkte (ab Januar 2026):

- [x] ISO 15118-20 BPT-Support (ChargeParameterDiscovery + ScheduleExchange)
- [x] Dynamic Control Mode (real-time Leistungsanpassung)
- [x] Plug&Charge (ISO 15118-20 + eMAID-Token)
- [x] OCPP 2.1 SetChargingProfile mit negativen Werten
- [x] SOC-Guardrails (EVMinimumV2XEnergyRequest)
- [x] Ramp-Rate ≤ 20 A/s (CharIN Guide 2.0)
- [x] mTLS Client-Certs für CSMS-Verbindung
- [ ] V2G Root-CA Zertifikat (echte Hardware, nicht simuliert)
- [ ] OEM-CA / Contract-Cert (Plug&Charge, Hardware-abhängig)

---

## Use Cases

### UC-V2G-01: PV-Überschuss laden, abends entladen

1. Tags wenn PV-Überschuss → EV lädt (SelfConsumptionController)
2. Abends wenn Preis > Schwellwert → EVV2GDischargeController aktiviert Entladung
3. MPC-Optimizer plant 24h-Schedule (Lade- und Entladezeitfenster)
4. OCPP 2.1 SetChargingProfile mit gemischtem Schedule

### UC-V2G-02: OpenADR IMPORT_CAPACITY_SUB (Peak-Shaving)

1. OpenADR31Adapter empfängt `CONSTRAINT/IMPORT_CAPACITY_SUB: 5000W`
2. UC26Translator übersetzt → Matter DEM PA-Command
3. EVV2GDischargeController schaltet in Entladung (reduziert Netz-Import)
4. OpenADR Report: `DEMAND_FLEX_MIN/MAX` zurück an VTN

### UC-V2G-03: V2H Notstrom

1. Grid-Ausfall erkannt (GridData.powerW = 0, Frequenz außerhalb Band)
2. EmergencyCapacityController schaltet in Notstrom-Modus
3. EVV2GDischargeController entlädt EV → Haushalt (V2H, Inselbetrieb)
4. Auto-Stop bei EV-SOC < 20 % (Hard-Stop-Guardrail)

---

## Konfiguration

```typescript
// EEBUSAdapter Config
const ocppConfig: AdapterConnectionConfig = {
  name: 'Webasto Live 22kW',
  host: '192.168.1.100',
  port: 9000,
  tls: true,
  clientCert: '<PEM base64>',
  clientKey: '<PEM base64>',
};

// V2G Settings in StoredSettings
const v2gSettings = {
  v2gEnabled: true,
  v2gMinSocPercent: 30,
  v2gDischargeThresholdEurKWh: 0.25,
  v2gMaxDischargePowerW: 7400,
  v2gHonorOpenADR: true,
  v2gHonor14aEnWG: true,
};
```

---

## Kompatible Wallboxen und Fahrzeuge (2026)

**V2G-fähige Wallboxen (OCPP 2.1 + ISO 15118-20):**
- Webasto Live 22 kW V2G
- ABB Terra AC 22 kW (ISO 15118)
- KOSTAL ENECTOR 3.7/11/22

**V2G-fähige Fahrzeuge (Marktstart 2025/26):**
- BMW iX3 (Frühjahr 2026, bidirektional)
- Mercedes GLC 2026 (V2H)
- Volvo EX90 / EX30
- Hyundai IONIQ 5/6 (V2G-ready)
- Nissan LEAF e+ (V2H, via CHAdeMO-Adapter)

---

*Letzte Aktualisierung: 2026-04-25 | Nexus-HEMS-Dash v1.2.0*
