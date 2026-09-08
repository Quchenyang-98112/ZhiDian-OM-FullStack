# ADR-013: V2G BPT-Parameter in OCPP21Adapter und EnergyAdapter-Interface

- **Status:** Accepted
- **Datum:** 2026-04-25
- **Autoren:** Nexus-HEMS-Dash Architektur-Team

## Kontext

Der bestehende `OCPP21Adapter` (v1.1.0) hat einen vereinfachten V2X-Discharge-Stub:
```typescript
private sendV2XDischarge(dischargePowerW: number): boolean
```

Dies ist **nicht AFIR-konform** (EU AFIR Jan 2026) und entspricht nicht ISO 15118-20, da die
vollständige BPT-Negotiation (6 Pflichtparameter + DER-Bitmap) fehlt.

## Entscheidungsfragen

1. Wie vollständig soll die BPT-Implementierung sein?
2. Wo werden die BPT-Parameter typdefiniert?
3. Wie werden SOC-Guardrails implementiert?

## Optionen

### Option A: Vollständige BPT-Parameter in EnergyAdapter-Interface und OCPP21Adapter

Ein neues `BPTNegotiationParams`-Interface beschreibt alle ISO 15118-20 BPT-Pflichtparameter.
`EVChargerData` wird um `bptParams?: BPTNegotiationParams` erweitert.
`OCPP21Adapter` erhält vollständige Methoden für ChargeParameterDiscovery, ScheduleExchange
und BPT-Discharge-Profile.

**Vorteile:**
- AFIR-konform (Jan 2026 Pflicht)
- CharIN Guide 2.0 DC BPT kompatibel
- Typ-sichere Übergabe von Discharge-Constraints an MPC-Optimizer und Controller
- Zukunftssicher für AC BPT DER Amendment 1

**Nachteile:**
- Aufwändiger (neue Interface-Felder, neue Methoden)
- Echte ISO 15118-Compliance erfordert Hardware-Tests (EVSE + EV-Kombination)

### Option B: Nur OCPP SetChargingProfile mit negativen Stromwerten

Keine Interface-Änderungen, nur `SetChargingProfile` mit negativem `limit`-Wert.

**Vorteile:**
- Schnell implementierbar
- Kein Regressions-Risiko

**Nachteile:**
- Nicht AFIR-konform
- Keine semantischen SOC-Guardrails
- Keine BPT-Negotiation (ChargeParameterDiscovery fehlt)

## Entscheidung

**Option A für v1.2.0.** Vollständige BPT-Parameter.

Begründung:
1. EU AFIR macht ISO 15118-20 BPT ab Januar 2026 für V2G-Ladepunkte zur Pflicht
2. Code wird AFIR-ready — Hardware-Tests werden separat (EVSE-Lab-CI) geführt
3. Semantische BPT-Parameter ermöglichen sichere SOC-Guardrails (Sicherheitskritisch!)
4. DER-Bitmap-Vorbereitung für AC BPT DER Amendment 1 (erwartet Q2 2026)

## Neue Typen

```typescript
// apps/web/src/core/adapters/EnergyAdapter.ts

/** ISO 15118-20 BPT Negotiation Parameters */
export interface BPTNegotiationParams {
  // Charge constraints (positive values)
  evMaximumChargePower: number;        // kW
  evMinimumChargePower: number;        // kW
  evMaximumChargeCurrent: number;      // A
  evMaximumVoltage: number;            // V
  evMinimumVoltage: number;            // V
  // Discharge constraints (negative = discharge, ISO 15118-20)
  evMaximumDischargePower: number;     // kW (negative für Discharge: z. B. -10)
  evMinimumDischargePower: number;     // kW (negative)
  evMaximumDischargeCurrent: number;   // A (negative)
  evMinimumDischargeCurrent: number;   // A (negative)
  // V2X Energy Guardrails (optional, empfohlen)
  evMaximumV2XEnergyRequest?: number;  // Wh (Max. V2X-Energie)
  evMinimumV2XEnergyRequest?: number;  // Wh (SOC-Floor in Wh)
  // AC BPT DER (Amendment 1)
  derBitmap?: number;                  // 8-Bit Bitmap (ServiceID 8)
}
```

## SOC-Guardrail-Invariante

Die folgende Invariante MUSS immer gelten:
```
evSocPercent >= minV2XSocThreshold (Default: 30%)
```

Verletzung → Runtime-Fehler (kein V2G-Command wird ausgeführt).

## Konsequenzen

- `EVChargerData` bekommt `bptParams?: BPTNegotiationParams`
- `EVChargerData` bekommt `evSocPercent?: number` (für Controller-Entscheidungen)
- `EVV2GDischargeController` nutzt `bptParams.evMaximumDischargePower` als Input
- MPC-Optimizer nutzt `bptParams` für V2X-Constraints

---

**Links:**
- [ISO 15118-20:2022](https://www.iso.org/standard/77845.html)
- [CharIN Interoperability Guide 2.0 DC BPT](https://www.charinev.org)
- [docs/V2G-Integration-Guide.md](../V2G-Integration-Guide.md)
- [docs/AFIR-Compliance-Checklist.md](../AFIR-Compliance-Checklist.md)
