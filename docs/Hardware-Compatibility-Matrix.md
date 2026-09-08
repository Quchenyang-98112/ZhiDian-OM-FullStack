# Hardware Compatibility Matrix

> **Last updated:** 2026-04-25 · Generated from `apps/web/src/core/hardware-registry.ts`
>
> ✅ = Certified & tested · ⚠️ = Community-reported · Protocol abbreviations below table.

**Protocol Key:**
`MQTT` = MQTT/WebSocket · `Modbus` = Modbus TCP/RTU · `SunSpec` = SunSpec (Modbus) ·
`REST` = HTTP REST API · `OCPP` = OCPP 1.6/2.0/2.1 · `EEBUS` = EEBUS/SPINE ·
`KNX` = KNX/IP · `Victron` = Victron dbus/MQTT · `HA` = via HomeAssistant MQTT ·
`evcc` = via evcc API · `OpenEMS` = via OpenEMS WebSocket RPC

---

## Inverters & Hybrid Systems (28 devices)

| Manufacturer | Model | Max Power | MQTT | Modbus | SunSpec | REST | Nexus Adapter | Notes |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| **Victron Energy** | MultiPlus-II 48/3000 | 3 kW | ✅ | ✅ | — | — | VictronMQTTAdapter | Cerbo GX required |
| **Victron Energy** | MultiPlus-II 48/5000 | 5 kW | ✅ | ✅ | — | — | VictronMQTTAdapter | Cerbo GX required |
| **Victron Energy** | MultiPlus-II 48/10000 | 10 kW | ✅ | ✅ | — | — | VictronMQTTAdapter | Cerbo GX required |
| **Victron Energy** | Quattro-II 48/5000 | 5 kW | ✅ | ✅ | — | — | VictronMQTTAdapter | Cerbo GX required |
| **SMA** | Sunny Tripower X 12-25 | 25 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | SunSpec Models 103/124 |
| **SMA** | Sunny Boy Storage 3.7-6.0 | 6 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **SMA** | Tripower Smart Energy 5-10 | 10 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **Fronius** | Symo GEN24 Plus 6-10 | 10 kW | — | ✅ | ✅ | ✅ | ModbusSunSpecAdapter | Solar API v1 |
| **Fronius** | Primo GEN24 Plus 3-6 | 6 kW | — | ✅ | ✅ | ✅ | ModbusSunSpecAdapter | |
| **Fronius** | Tauro 50-100 | 100 kW | — | ✅ | ✅ | ✅ | ModbusSunSpecAdapter | Commercial |
| **Huawei** | SUN2000 3-20 KTL | 20 kW | — | ✅ | — | — | ModbusSunSpecAdapter | FusionSolar RS485 |
| **Huawei** | SUN2000-5/6/8/10KTL-M1 | 10 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |
| **Kostal** | PLENTICORE plus 4.2-10 | 10 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **Kostal** | PIKO IQ 4.2-10 | 10 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **GoodWe** | ET Plus+ 5-30kW Hybrid | 30 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **GoodWe** | DNS Series 3-6kW | 6 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |
| **SolarEdge** | SE HD-Wave 3-11.4kW | 11.4 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **SolarEdge** | SE Three Phase 5-33.3kW | 33.3 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **SolarEdge** | Home Hub Inverter | 10 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **Enphase** | IQ8+ Microinverter | 0.3 kW | — | — | — | ✅ | OpenEMSAdapter / HA | Envoy gateway |
| **Enphase** | IQ Battery 5P | 3.84 kW | — | — | — | ✅ | HA MQTT | Envoy gateway |
| **RCT Power** | Storage DC 6.0-10.0 | 10 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |
| **KACO** | blueplanet hybrid 10.0 TL3 | 10 kW | — | ✅ | ✅ | — | ModbusSunSpecAdapter | |
| **Sungrow** | SH5.0-10RT Hybrid | 10 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |
| **Growatt** | SPH 3000-10000TL3 BH | 10 kW | — | ✅ | — | — | ModbusSunSpecAdapter | RS485/TCP |
| **Fox ESS** | H3 5-12kW Hybrid | 12 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |
| **Deye** | SUN-5-12K-SG04LP3 Hybrid | 12 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |
| **Sofar Solar** | HYD 3-20 KTL-3PH | 20 kW | — | ✅ | — | — | ModbusSunSpecAdapter | |

---

## EV Wallboxes & Chargers (19 devices)

| Manufacturer | Model | Max Power | OCPP | Modbus | REST | MQTT | EEBUS | V2X | Nexus Adapter | Notes |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|---|---|
| **Victron Energy** | EV Charging Station | 22 kW | — | — | — | ✅ | — | — | VictronMQTTAdapter | |
| **go-e** | Charger Gemini / Gemini flex 2 | 22 kW | 1.6 | — | ✅ | ✅ | — | — | OCPP21Adapter / evcc | |
| **Easee** | Home / Charge | 22 kW | 1.6 | — | ✅ | — | — | — | OCPP21Adapter | |
| **KEBA** | KeContact P30 x-series | 22 kW | 1.6 | ✅ | — | — | ✅ | — | OCPP21Adapter / EEBUSAdapter | |
| **wallbe** | Eco S / Pro | 22 kW | — | ✅ | — | — | — | — | ModbusSunSpecAdapter | |
| **Hardy Barth** | cPH1 / cPH2 | 22 kW | — | ✅ | ✅ | — | — | — | OCPP21Adapter | |
| **OpenEVSE** | OpenEVSE v5.5 / WiFi | 22 kW | 1.6 | — | ✅ | ✅ | — | — | OCPP21Adapter | Open source |
| **openWB** | openWB Pro / Series 2 | 22 kW | — | — | ✅ | ✅ | — | — | EvccAdapter | evcc native |
| **Heidelberg** | Energy Control / Wallbox | 11 kW | — | ✅ | — | — | — | — | ModbusSunSpecAdapter | |
| **Tesla** | Wall Connector Gen 3 | 22 kW | — | — | ✅ | — | — | — | HA MQTT / REST | No OCPP |
| **ABB** | Terra AC Wallbox 11/22 kW | 22 kW | 2.0 | ✅ | — | — | — | — | OCPP21Adapter | |
| **Webasto** | Unite 11/22 kW | 22 kW | 1.6 | ✅ | — | — | — | — | OCPP21Adapter | |
| **Alfen** | Eve Single Pro-Line | 22 kW | 2.0 | ✅ | — | — | — | — | OCPP21Adapter | |
| **Mennekes** | AMTRON Charge Control | 22 kW | 1.6 | ✅ | — | — | ✅ | — | OCPP21Adapter | |
| **Phoenix Contact** | EM-CP-PP-ETH / CHARX | 22 kW | 1.6 | ✅ | — | — | — | — | OCPP21Adapter | |
| **Vestel** | EVC04 11/22 kW | 22 kW | 1.6 | ✅ | — | — | — | — | OCPP21Adapter | |
| **myenergi** | zappi V2 | 22 kW | — | — | ✅ | — | — | — | HA MQTT | |
| **cFos** | Power Brain Wallbox | 22 kW | 1.6 | ✅ | ✅ | — | — | — | OCPP21Adapter | |
| **SMA** | EV Charger 7.4 / 22 | 22 kW | — | ✅ | — | — | ✅ | — | EEBUSAdapter | |

---

## Smart Meters & Energy Meters (15 devices)

| Manufacturer | Model | Phases | Modbus RTU | Modbus TCP | REST | MQTT | SunSpec | Nexus Adapter | Notes |
|---|---|---|:---:|:---:|:---:|:---:|:---:|---|---|
| **Victron Energy** | Energy Meter EM24 | 3 | ✅ | — | — | ✅ | — | VictronMQTTAdapter | |
| **Carlo Gavazzi** | EM340 / EM530 | 3 | ✅ | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Shelly** | 3EM / Pro 3EM | 3 | — | — | ✅ | ✅ | — | ShellyRESTAdapter | Gen1/2/3 REST |
| **Shelly** | EM / Plus EM | 1 | — | — | ✅ | ✅ | — | ShellyRESTAdapter | Gen1/2/3 REST |
| **Janitza** | UMG 96RM / 604 | 3 | — | ✅ | — | — | — | ModbusSunSpecAdapter | Industrial |
| **SMA** | Sunny Home Manager 2.0 | 3 | — | — | — | ✅ | — | HA MQTT / evcc | SMA Speedwire |
| **Fronius** | Smart Meter TS 65 | 3 | — | ✅ | ✅ | — | ✅ | ModbusSunSpecAdapter | |
| **Eastron** | SDM630 / SDM120 | 3/1 | ✅ | ✅ | — | — | — | ModbusSunSpecAdapter | Very common |
| **ABB** | B23 / B24 3-Phase Meter | 3 | ✅ | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Siemens** | PAC2200 / PAC3200 | 3 | — | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Kostal** | Smart Energy Meter | 3 | — | ✅ | — | — | ✅ | ModbusSunSpecAdapter | |
| **Tibber** | Pulse IR Reader | 1 | — | — | ✅ | ✅ | — | HA MQTT | Requires Tibber account |
| **Discovergy** | Metering Service | 3 | — | — | ✅ | — | — | HA MQTT | Cloud API |
| **ISKRA** | ME172 / ME162 | 3 | ✅ | — | — | — | — | ModbusSunSpecAdapter | |
| **Hager** | EC352 / EHZ | 3 | ✅ | ✅ | — | — | — | ModbusSunSpecAdapter | SML IR |

---

## Battery Storage Systems (20 devices)

| Manufacturer | Model | Capacity | Modbus | REST | MQTT | EEBUS | Nexus Adapter | Notes |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| **BYD** | HVS 12.8 kWh | 12.8 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | Via inverter |
| **BYD** | HVS 25.6 kWh | 25.6 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **BYD** | HVM 22.1-25.6 kWh | 25.6 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Pylontech** | US5000 / US4000 | 4.8 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | RS485 CAN |
| **Pylontech** | Force H2 | 14.2 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Tesla** | Powerwall 2 | 13.5 kWh | — | ✅ | — | — | HA MQTT / evcc | Local API |
| **Tesla** | Powerwall 3 | 13.5 kWh | — | ✅ | — | — | HA MQTT | Gen 3 API |
| **Sonnen** | eco 10 / hybrid 10 | 22 kWh | — | ✅ | ✅ | — | evccAdapter | Sonnen API |
| **VARTA** | Element / pulse S | 16 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Huawei** | LUNA2000 | 30 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | Via inverter |
| **Sungrow** | SBR096 / 128 / 160 / 200 | 19.2 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **FENECON** | Home 10 | 10 kWh | — | ✅ | — | — | OpenEMSAdapter | OpenEMS |
| **E3/DC** | S10 E Pro | 10.1 kWh | ✅ | ✅ | — | — | ModbusSunSpecAdapter | |
| **Senec** | Home V3 Hybrid | 6.5 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | |
| **Alpha ESS** | STORION-S5 | 44 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | WebSocket |
| **Fronius** | Solar Battery 9.5 | 9.6 kWh | — | ✅ | — | — | ModbusSunSpecAdapter | Via inverter |
| **Anker** | SOLIX E1600 | 19.2 kWh | — | ✅ | ✅ | — | HA MQTT | |
| **EcoFlow** | Delta Pro Ultra | 6 kWh | — | — | ✅ | — | HA MQTT | |
| **PowerOak** | Bluetti AC500 | 19.8 kWh | — | — | — | — | HA MQTT | |
| **SimpliPhi** | SimpliPhi Power Alpha | 100 kWh | ✅ | — | — | — | ModbusSunSpecAdapter | Commercial |

---

## Heat Pumps — SG Ready (14 devices)

| Manufacturer | Model | SG Ready | Modbus | EEBUS | KNX | REST | Nexus Controller | Notes |
|---|---|:---:|:---:|:---:|:---:|:---:|---|---|
| **Vaillant** | aroTHERM plus / aroTHERM split | ✅ | ✅ | ✅ | — | ✅ | HeatPumpSGReadyController | SENSO Home app |
| **STIEBEL ELTRON** | WPL A 07-13 Premium | ✅ | ✅ | ✅ | — | — | HeatPumpSGReadyController | ISG web |
| **Nibe** | F1255 / F1145 | ✅ | ✅ | ✅ | ✅ | — | HeatPumpSGReadyController | NIBE Uplink |
| **Viessmann** | Vitocal 250-A | ✅ | ✅ | ✅ | — | — | HeatPumpSGReadyController | ViCare gateway |
| **Mitsubishi** | Ecodan ATW-XSC30D-01 | ✅ | ✅ | — | — | ✅ | HeatPumpSGReadyController | MELCloud |
| **Daikin** | Altherma 3 R | ✅ | ✅ | — | — | — | HeatPumpSGReadyController | Onecta app |
| **Wolf** | CHA-10-Monoblock | ✅ | ✅ | — | ✅ | — | HeatPumpSGReadyController | Smart Home System |
| **Bosch** | Compress 7000i AW | ✅ | ✅ | — | — | — | HeatPumpSGReadyController | EasyControl |
| **Panasonic** | Aquarea L/M series | ✅ | ✅ | — | — | — | HeatPumpSGReadyController | AquaRepo |
| **Alpha Innotec** | SWCV 82H3 | ✅ | ✅ | — | — | — | HeatPumpSGReadyController | luxtronik |
| **Buderus** | Logatherm WLW196i | ✅ | ✅ | — | — | ✅ | HeatPumpSGReadyController | |
| **Ochsner** | Air Eagle 407 Pro | ✅ | ✅ | — | — | — | HeatPumpSGReadyController | |
| **Glen Dimplex** | SI 9TU | ✅ | ✅ | ✅ | — | — | HeatPumpSGReadyController | |
| **Hoval** | UltraSource B Comfort | ✅ | ✅ | — | — | — | HeatPumpSGReadyController | |

---

## Summary Matrix by Protocol

| Protocol | Adapters | Devices |
|----------|---------|---------|
| **Modbus TCP/RTU (SunSpec)** | ModbusSunSpecAdapter | 50+ |
| **MQTT over WebSocket** | VictronMQTTAdapter, HomeAssistantMQTTAdapter, Zigbee2MQTTAdapter | 15+ |
| **OCPP 1.6 / 2.0 / 2.1** | OCPP21Adapter | 15 wallboxes |
| **EEBUS / SPINE** | EEBUSAdapter | 8 wallboxes + 7 heat pumps |
| **KNX/IP** | KNXAdapter | 3 heat pumps + unlimited KNX devices |
| **HTTP REST** | ShellyRESTAdapter, ModbusSunSpecAdapter | 10+ |
| **Victron dbus/MQTT** | VictronMQTTAdapter | 5 Victron devices |
| **via Home Assistant MQTT** | HomeAssistantMQTTAdapter | All HA integrations |
| **via evcc API** | EvccAdapter | 95%+ supported evcc devices |
| **via OpenEMS** | OpenEMSAdapter | All OpenEMS-compatible devices |

---

## Add a New Device

> **Browse in-app:** the full registry ships as a searchable/filterable catalog at **`/settings/hardware`** (`HardwareRegistryPage`), with category / manufacturer / protocol filters and an add-adapter wizard (`AddAdapterWizard`) that maps a chosen device to a protocol adapter, runs a mock/live connection test, and enables it (MED-19).

If your device is not listed:

1. Check if it supports any listed protocol — if yes, configure the corresponding adapter.
2. File a GitHub Issue with manufacturer, model, and protocol information.
3. Implement a new contrib adapter following [docs/Adapter-Dev-Guide.md](./Adapter-Dev-Guide.md).
4. Add the device to `apps/web/src/core/hardware-registry.ts` and open a PR.

---

*Source: `apps/web/src/core/hardware-registry.ts` · [Adapter Dev Guide](./Adapter-Dev-Guide.md) · [Adapter-Registry](../apps/web/src/core/adapters/adapter-registry.ts)*
