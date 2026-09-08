# ADR-014: VPP als Single-Home-VPP-Node (kein Multi-HEMS v1.2.0)

- **Status:** Accepted
- **Datum:** 2026-04-25
- **Autoren:** Nexus-HEMS-Dash Architektur-Team

## Kontext

Nexus-HEMS-Dash aggregiert im Heimnetz alle DEMs (PV, Batterie, EV, Wärmepumpe) zu einer
virtuellen Kraftwerkseinheit (VPP). Grundsätzlich können mehrere HEMS-Instanzen (Haushalte)
zu einem gemeinsamen VPP aggregiert werden — multi-tenancy ist für Aggregatoren relevant.

## Entscheidungsfrage

Soll v1.2.0 Single-Home-VPP (ein Haushalt als einzelner VEN) oder
Multi-HEMS-Aggregation (mehrere Haushalte unter einer VEN-ID) implementieren?

## Optionen

### Option A: Single-Home VPP-Node (gewählt)

Nexus als einzelner VEN bei einem VPP-Operator.
Alle heiminternen DEMs werden lokal aggregiert (EVV2GDischargeController + VPPService).
Extern ist Nexus ein einziger VEN mit einer VEN-ID.

**Vorteile:**
- Sofort implementierbar (kein Multi-Tenancy-Overhead)
- Abdeckt 90%+ der realen Anwendungsfälle (Einzelhaushalt)
- Passt perfekt zu bestehender Architektur (single Zustand im useEnergyStore)
- Kein Identity-/Auth-Aufwand für Household-Registry

**Nachteile:**
- Aggregator-Sicht (mehrere Haushalte) nicht möglich
- Kleineres Flex-Potenzial pro VEN-ID

### Option B: Multi-HEMS-Aggregation

Mehrere Nexus-Instanzen registrieren sich bei einem zentralen Aggregator.
Aggregator fasst mehrere VENs zusammen.

**Vorteile:**
- Größeres VPP-Potenzial
- Relevant für Aggregatoren (Tibber, Next Kraftwerke)

**Nachteile:**
- Erfordert: gemeinsame Identity-Infrastruktur, Fleet-Registry, OCPI-Bridge
- Erheblicher Mehraufwand (Multi-Tenancy, Auth-Layer)
- Sicherheitskritisch (Inter-HEMS-Kommunikation)
- Scope weit über v1.2.0 hinaus

## Entscheidung

**Option A für v1.2.0.** Single-Home VPP-Node.

Begründung:
1. 90%+ der Nexus-Nutzer sind Einzelhaushalte
2. Multi-HEMS erfordert eigene Identity-/Security-Infrastruktur (ADR-009 RBAC ist deferred)
3. Single-HEMS deckt alle Use Cases für §14a EnWG, Redispatch und Tibber-Flex ab
4. Multi-HEMS als v2.0.0-Feature geplant (klare Erweiterungsstrategie)

## VPPService-Scope (v1.2.0)

```
VPPService (Single-Home):
  ├── ResourceRegistry  ← aggregiert PV/Batterie/EV/WP des einen Haushalts
  ├── FlexCapacityCalc  ← Up/Down-Flex des Haushalts
  ├── DispatchEngine    ← dispatcht OpenADR-Events auf lokale Ressourcen
  ├── RevenueTracker    ← Dexie.js (lokal)
  └── ReportGenerator   ← DEMAND_FLEX_MIN/MAX für einen VEN
```

## Multi-HEMS Migration (v2.0.0)

Wenn Multi-HEMS implementiert wird:
- Neue `FleetService`-Klasse in `apps/api` (Backend-only)
- Nexus-Instanz registriert sich als "member" bei einem Fleet-Operator
- Fleet-Operator aggregiert mehrere VENs zu einer gemeinsamen VEN-ID beim VTN
- Einzelne HEMS-Instanzen bekommen Dispatch-Befehle über Fleet-API
- ADR-009 Multi-User RBAC ist Prerequisite

---

**Links:**
- [docs/VPP-FlexMarket-Guide.md](../VPP-FlexMarket-Guide.md)
- [ADR-009: Multi-User RBAC (Future)](ADR-009-multi-user-rbac-future.md)
