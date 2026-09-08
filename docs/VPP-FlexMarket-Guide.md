# VPP Flex-Market Guide — Single-Home VPP-Node mit Nexus-HEMS-Dash

Dieses Dokument beschreibt die VPP-Funktionalität (Virtual Power Plant) von Nexus-HEMS-Dash
v1.2.0. Nexus fungiert als einzelner **VPP-Node / Edge-DERMS** — aggregiert alle Heimenergie-
ressourcen zu einer steuerbaren virtuellen Einheit für Flexibilitätsmärkte, Redispatch 2.0,
§14a EnWG und Arbitrage.

## Was ist ein VPP?

Ein **Virtual Power Plant** aggregiert mehrere dezentrale Energie-Ressourcen (DERs) zu einer
"virtuellen" steuer baren Kraftwerkseinheit, ohne physisches Großkraftwerk:

```
PV-Anlage  +  Batterie  +  EV (V2G)  +  Wärmepumpe  =  Virtuelles Kraftwerk
 5 kWp         10 kWh       60 kWh           WP              ~75 kWh Flex
```

**Nexus-Scope v1.2.0:** Single-Home VPP-Node (ein Haushalt als selbstständiger VEN).
Multi-Household-Aggregation ist für v2.0.0 geplant.

---

## Architektur: VPPService

```typescript
// apps/web/src/core/vpp-service.ts
VPPService
  ├── ResourceRegistry  — registriert PV, Batterie, EV, WP
  ├── FlexCapacity      — berechnet verfügbare Up/Down-Flex
  ├── DispatchEngine    — verteilt OpenADR-Events auf Ressourcen
  ├── RevenueTracker    — speichert Erlöse in Dexie.js
  └── ReportGenerator   — erstellt OpenADR DEMAND_FLEX-Reports
```

**Integration:**
```
OpenADR31Adapter.onEvent
       ↓
VPPService.dispatchFlexEvent(event)
       ↓
UC26IncentiveTranslator.translateEvent(event, resources)
       ↓
DEM-Commands an Matter ESAs / OCPP V2G-Commands / EEBUS LoadControl
       ↓
VPPService.generateFlexibilityReport()
       ↓
OpenADR31Adapter.submitReport(report)
```

---

## Ressourcen-Registry

```typescript
// Ressourcen-Typen
type VPPResourceType = 'pv' | 'battery' | 'ev' | 'heat_pump' | 'smart_meter';

interface VPPResource {
  id: string;               // Eindeutige ID (z. B. "ev-ocpp-01")
  type: VPPResourceType;
  adapterId: string;        // Welcher Adapter steuert die Ressource
  maxFlexUpW: number;       // Max. reduzierbare Last (W)
  maxFlexDownW: number;     // Max. erhöhbare Einspeisung / Ladung (W)
  currentPowerW: number;    // Aktuelle Leistung
  constraints: {
    minSocPercent?: number; // Nur für ev/battery
    maxTempC?: number;      // Nur für heat_pump
    mandatoryCharge?: boolean; // EV muss bis Abfahrtszeit geladen sein
  };
}
```

**Beispiel-Registrierung:**
```typescript
vppService.registerResource({
  id: 'ev-ocpp-01',
  type: 'ev',
  adapterId: 'ocpp-21',
  maxFlexUpW: 11000,     // Kann 11 kW Laden reduzieren
  maxFlexDownW: 7400,    // Kann 7.4 kW V2G einspeisen
  currentPowerW: 7200,
  constraints: { minSocPercent: 30, mandatoryCharge: true }
});

vppService.registerResource({
  id: 'battery-victron-01',
  type: 'battery',
  adapterId: 'victron-mqtt',
  maxFlexUpW: 5000,
  maxFlexDownW: 5000,
  currentPowerW: 1000,
  constraints: { minSocPercent: 10 }
});
```

---

## Flex-Kapazität-Berechnung

```
Up-Flex = Σ(aktive Lasten, die reduziert werden können)
  = EV-Ladeleistung + WP-Leistung + sonstige schaltbare Lasten

Down-Flex = Σ(Ressourcen, die Einspeisung erhöhen können)
  = V2G-Entladepotenzial + Batterie-Entladepotenzial + PV-Hochregeln
```

**Beispielberechnung:**
```
UP-FLEX:
  EV laden: 7.2 kW (kann auf 0 reduziert werden) = +7.2 kW
  Wärmepumpe: 2.1 kW (kann für 2 h unterbrochen werden) = +2.1 kW
  Total Up-Flex: 9.3 kW

DOWN-FLEX (zusätzliche Einspeisung):
  V2G (EV, SOC 75%): 7.4 kW Entladepotenzial = +7.4 kW
  Batterie (SOC 80%): 5.0 kW Entladepotenzial = +5.0 kW
  Total Down-Flex: 12.4 kW

DEMAND_FLEX_MIN: 9.3 kW (sichere pausierbare Last)
DEMAND_FLEX_MAX: 21.7 kW (Up + Down Flex gesamt)
```

---

## Dispatch-Priorisierung

Bei einem OpenADR-Event werden Ressourcen in dieser Reihenfolge dispatcht:

| Priorität | Ressource | Begründung |
|---|---|---|
| 1 | EV (V2G) | Größte Flex, direkt steuerbar via OCPP |
| 2 | Batterie (ESS) | Hohe Flex, kurze Reaktionszeit |
| 3 | Wärmepumpe (verschiebbar) | Thermischer Speicher als Puffer |
| 4 | PV (Drosselung) | Nur im Notfall (Ertrags verlust) |

**Dispatch-Flow UC 2.6.3 (Power-Limitation):**
```
OpenADR IMPORT_CAPACITY_SUB: 4200 W (§14a EnWG)
Aktuelle Last: 14.5 kW

Reduzierung nötig: 14.5 - 4.2 = 10.3 kW

Step 1: EV-Laden stoppen (7.2 kW) → Rest: 3.1 kW
Step 2: WP auf Minimum (2.1 → 0.5 kW) → Rest: 1.5 kW
Step 3: V2G aktivieren (1.5 kW Entladung) → Netz-Import: 4.2 kW ✓
```

---

## Revenue-Tracking

Alle Flex-Erlöse werden in Dexie.js gespeichert:

```typescript
interface VPPRevenueEntry {
  timestamp: number;
  programId: string;
  eventId: string;
  flexProvidedKWh: number;
  revenueEur: number;
  resourceType: VPPResourceType;
}
```

**Dashboard-Metriken:**
- Tagesumsatz (€/Tag)
- Monatsumsatz (€/Monat)
- Kumulierter Jahresumsatz
- Flex-Erlös pro Ressourcentyp (EV, Batterie, WP)
- Amortisationsberechnung für EV / Batterie

---

## Erlöspotenzial (Beispielhaushalt 2026)

| Scenario | Ressourcen | Flex | Potenzial |
|---|---|---|---|
| **Basis** | Batterie 10 kWh | 2–3 kW Up-Flex | ~50–80 €/Jahr |
| **Erweitert** | + EV V2G | +7.4 kW Down-Flex | ~150–250 €/Jahr |
| **Full** | + Wärmepumpe | +2 kW Up-Flex | ~200–350 €/Jahr |

*Basierend auf Tibber/Next Kraftwerke Flex-Tarifen 2026 (geschätzt).*

---

## §14a EnWG Grid-Fee-Rabatt

Bei aktivem §14a-Netzbetreiber-Vertrag:
- **Netzentgelt-Rabatt**: ca. 50–150 €/Jahr (je nach Netzbetreiber)
- **Voraussetzung**: Smart Meter + steuerbare Verbrauchseinrichtung
- **Nexus-Umsetzung**: OpenADR `IMPORT_CAPACITY_SUB`-Events automatisch annehmen

---

## VPP-Dashboard (Analytics-Seite)

Das VPP Revenue Panel in `Analytics.tsx` zeigt:
- **Kumulierter Revenue-Chart** (Recharts AreaChart, täglich/wöchentlich/monatlich)
- **Flex-Kapazität-Donut** (Ressourcen-Aufteilung)
- **Aktive Programme-Tabelle** (OpenADR Programme + Status)
- **PDF-Export** (VPP-Report als jsPDF mit QR-Share)

---

## Zukunft: Multi-HEMS-Aggregation (v2.0.0)

Multi-Household-VPP-Aggregation erfordert:
- Gemeinsame Identity-Infrastruktur (gemeinsame VEN-ID bei VTN)
- OCPI-Bridge zwischen HEMS-Instanzen
- Zentrale Fleet-Management-Registry
- Vorgesehen für v2.0.0 (ADR-014 dokumentiert die Entscheidung)

---

*Letzte Aktualisierung: 2026-04-25 | Nexus-HEMS-Dash v1.2.0*
