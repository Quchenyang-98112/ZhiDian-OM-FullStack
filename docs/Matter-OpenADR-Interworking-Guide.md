# Matter ↔ OpenADR Interworking Guide — UC 2.6 Incentive-Response

Dieses Dokument beschreibt die Integration der **OpenADR 3 to Matter Interworking Reference
Specification v1.0** (28. März 2025, geo/OpenADR Alliance/CSA) in Nexus-HEMS-Dash v1.2.0.

Nexus fungiert als **HEMS-Translator**: Empfängt OpenADR-Events vom Grid (VTN) und übersetzt
diese in Matter-DEM-Commands an lokale ESAs (Energy Smart Appliances).

## Architektur-Übersicht

```
VTN (DSRSP / Utility)
     │  OpenADR 3.1.0 (HTTPS + OAuth2)
     ▼
OpenADR31Adapter [VEN]
     │  openadr:event
     ▼
UC26IncentiveTranslator ←── MPC-Optimizer (Forecast + Arbitrage)
     │  matter:dem:command
     ▼
MatterThreadAdapter [Controller]
     │  REST-Bridge (HTTP → Matter Controller)
     ▼
ESAs: EVSE, Wärmepumpe, Batterie, PV-Wechselrichter
```

**Spec-Zitat:** "The EMS acts as translator." (OpenADR 3 to Matter Interworking Spec v1.0)

---

## Matter DEM-Cluster (Device Energy Management)

### Cluster-IDs (Matter 1.3/1.4)

| Cluster | ID | Funktion in UC 2.6 |
|---|---|---|
| Device Energy Management (DEM) | 0x98 | Steuert ESA-Energieverbrauch |
| Electrical Power Measurement (EPM) | 0x90 | Echtzeit-Leistungsmessung |
| Electrical Energy Measurement (EEM) | 0x91 | Energie-Zählung + Sub-Metering |
| Power Source (PS) | 0x002F | Batterie-/Akku-Status |

### DEM-Features und Priorität

Die Spec definiert eine **Prioritätsreihenfolge** für DEM-Features:

```
FA (Full Activation)        [höchste Priorität]
   ↓
CON (Context-Aware Schedule)
   ↓
STA (State Tracking / Schedule)
   ↓
PAU (Pause)
   ↓
PA (Power Adjustment)       [niedrigste Priorität]
```

| Feature | Code | Funktion | Matter-Cluster-Attribut |
|---|---|---|---|
| FA | Full Activation | Sofort volle Leistung absenken | `DeviceEnergyManagement.RequestConstraintBasedForecast()` |
| CON | Context-Aware | Zeitfenster-basierter Schedule | `DeviceEnergyManagement.ReoptimizeSchedule()` |
| STA | State Tracking | SoC + ForecastStruct lesen | `DeviceEnergyManagement.PowerAdjustmentCapability` |
| PAU | Pause | Gerät für N Sekunden pausieren | `DeviceEnergyManagement.Pause()` |
| PA | Power Adjustment | Leistung auf X Watt setzen | `DeviceEnergyManagement.PowerAdjustRequest()` |
| PFR | Power Forecast Response | Forecast für OpenADR-Report | `DeviceEnergyManagement.Forecast` Subscribe |

---

## Use Case 2.6.1 — Whole-Home Incentive

**Szenario:** DSRSP sendet Preis-Event (PRICE) für das gesamte Haus.

### Sequence Flow

```
VTN    ─── PRICE Event (evt-042, 0.45 €/kWh 17:00–20:00) ──►  VEN (HEMS)
                                                                    │
                                                          UC26Translator.translateEvent()
                                                                    │
                                                          MPC reoptimize mit neuem Tarif
                                                                    │
                                          ◄── DEM FA/CON/PA Commands  ──  Matter ESAs
                                                                    │
VTN    ◄── DEMAND_FLEX_MIN/MAX Report ──────────────────────────────┘
```

### Implementierung (UC26IncentiveTranslator)

```typescript
const commands = translator.translateEvent(event, resources, 'whole-home');
// Gibt zurück:
[
  { clusterId: 0x98, feature: 'PA', nodeId: 'ev-001',
    payload: { powerW: 0, durationS: 10800 } },       // EV-Laden stoppen
  { clusterId: 0x98, feature: 'PA', nodeId: 'hp-001',
    payload: { powerW: 500, durationS: 10800 } },      // WP auf Minimum
  { clusterId: 0x98, feature: 'FA', nodeId: 'bat-001',
    payload: { exportW: 5000 } }                        // Batterie entladen
]
```

---

## Use Case 2.6.2 — Specific-ESA Incentive

**Szenario:** DSRSP sendet gezieltes PRICE-Event nur für EVSE (EV-Lader).

**Spec-Zitat:** "The EMS uses the tariff information together with the flexibility included in
the Forecast from the EVSE … to determine the best time to charge the EV."

### Vorgehen

1. Event enthält `targets: [{ type: "RESOURCE_NAME", values: ["ev-001"] }]`
2. UC26Translator matcht Resource-ID → nur EVSE-Adapter (OCPP21Adapter)
3. Forecast vom EVSE-DEM lesen (`PowerForecastStruct` via EEM-Subscription)
4. MPC-Optimizer plant neuen Ladeplan basierend auf Preissignal
5. DEM CON-Command mit optimiertem Schedule an EVSE
6. Report: ESA-spezifisches Sub-Metering (EEM-Cluster)

```typescript
const commands = translator.translateEvent(event, resources, 'specific-esa');
// Resource-ID-Matching aus event.targets
// Gibt nur DEM-Commands für die gematche ESA zurück
```

---

## Use Case 2.6.3 — Power-Limitation Constraint

**Szenario:** DSRSP sendet `IMPORT_CAPACITY_SUB: 4200` W (§14a EnWG Notfallbegrenzung).

**Spec-Zitat:** "HEMS enforces Import-Limit by reducing ESA power."

### Sequence Flow

```
VTN  ──► CONSTRAINT Event (IMPORT_CAPACITY_SUB: 4200 W)  ──►  VEN
                                                                 │
                                                   Echtzeit-Monitoring via EPM-Cluster
                                                      (GridData.powerW aktuell: 14.5 kW)
                                                                 │
                                                   Step 1: EV stoppen (-7.2 kW)
                                                   Step 2: WP minimieren (-1.6 kW)
                                                   Step 3: V2G aktivieren (-1.5 kW)
                                                                 │
                                                   Gesamt-Import: 4.2 kW ✓
                                                                 │
VTN  ◄──  READING Report (compliance: 4.2 kW) ─────────────────┘
```

### Priorisierungs-Algorithmus

```typescript
function enforceImportCap(capW: number, resources: VPPResource[]): DEM_Command[] {
  const currentImportW = getCurrentGridImport();
  let surplusW = currentImportW - capW;
  const commands: DEM_Command[] = [];

  // Reihenfolge: EV > WP > Batterie > PV
  for (const resource of resources.sort(byDispatchPriority)) {
    if (surplusW <= 0) break;
    const reduction = Math.min(surplusW, resource.maxFlexUpW);
    commands.push(createDEMCommand(resource, reduction));
    surplusW -= reduction;
  }
  return commands;
}
```

---

## Bidding-Loop (BID_PRICE)

```
VTN  ──► BID_PRICE Event  ──►  VEN
                                 │
                   VPPService.calculateTotalFlexCapacity()
                                 │
                   OpenADR31Adapter.submitBidPrice(offerW)
                                 │  OFFERED_DEMAND
                                 ▼
VTN  ──► ACCEPTED/REJECTED  ──►  VEN
                                 │
         Bei ACCEPTED:    UC26Translator.translateEvent()
                          → DEM-Commands an ESAs
                                 │
VTN  ◄──  Report (actuals)  ─────┘
```

---

## PowerForecastStruct (PFR Feature)

Matter 1.3 EEM-Cluster liefert `PowerForecastStruct` für OpenADR-Reports:

```typescript
interface PowerForecastStruct {
  forecastUpdateTime: number; // Epoch ms
  earliestStartTime?: number;
  latestEndTime?: number;
  isPauseable: boolean;
  slots: {
    minDurationS: number;
    maxDurationS: number;
    defaultDurationS: number;
    elapsedS?: number;
    slotIsPauseable?: boolean;
    minPowerAdjustmentW: number;
    maxPowerAdjustmentW: number;
    manufacturerESAState?: string;
    nominalPowerW: number;
    minPowerW?: number;
    maxPowerW?: number;
  }[];
}
```

Diese Struct wird von Nexus in OpenADR `DEMAND_FLEX_MIN/MAX` konvertiert:
```typescript
demandFlexMin = forecastStruct.slots[0].minPowerAdjustmentW;
demandFlexMax = forecastStruct.slots[0].maxPowerAdjustmentW;
```

---

## Sub-Metering (UC 2.6.2 EEM-Subscription)

Für Specific-ESA-Metering (UC 2.6.2) subscribed UC26Translator auf EEM-Cluster:

```typescript
// Matter EEM-Cluster-Subscription für Sub-Metering
matterAdapter.subscribeEEMCluster(nodeId, (reading) => {
  // Aktualisiert OpenADR-Report-Ressource mit ESA-spezifischem Verbrauch
  vppService.updateResourceMeasurement(resourceId, reading.energyKWh);
});
```

---

## Sicherheit und Datenschutz

| Aspekt | Implementierung |
|---|---|
| Lokale Matter-Kommunikation | Bleibt im Heimnetz (kein Cloud-Traffic) |
| OpenADR Privacy | VEN sieht nur eigene Programme/Events via Token-Privacy |
| User-Opt-Out | Jedes Event kann in der UI abgelehnt werden (`opt-out`) |
| Audit-Trail | Alle Translator-Aktionen in IndexedDB (Dexie) |
| Sichere Kommandos | Alle DEM-Commands durch CommandSafety-Layer |

---

*Letzte Aktualisierung: 2026-04-25 | Nexus-HEMS-Dash v1.2.0 | Basiert auf OpenADR 3 to Matter
Interworking Reference Specification v1.0 (28. März 2025)*
