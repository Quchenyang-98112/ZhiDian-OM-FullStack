"""Deterministic two-unit thermal-power-plant simulation data.

The adapter intentionally keeps simulation state in memory. It is safe for
local demos and provides the same shapes that a future DCS/SCADA adapter can
return without pretending that the data is from production sensors.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


SCENARIOS = {
    "正常运行": "normal",
    "能效偏低": "low_efficiency",
    "设备轻度退化": "degraded",
    "新能源消纳": "renewable_absorption",
}


class PlantSimulation:
    def __init__(self) -> None:
        self.scenario = "正常运行"
        self.tick = 0

    def set_scenario(self, scenario: str) -> str:
        self.scenario = scenario if scenario in SCENARIOS else "正常运行"
        return self.scenario

    def _now(self) -> datetime:
        return datetime.now().replace(microsecond=0)

    def _units(self) -> list[dict[str, Any]]:
        low = self.scenario == "能效偏低"
        degraded = self.scenario == "设备轻度退化"
        renewable = self.scenario == "新能源消纳"
        return [
            {
                "id": "unit-1",
                "name": "1号超临界燃煤机组",
                "ratedPowerMw": 600,
                "outputMw": 452 if low else 468,
                "loadRate": 75 if low else 78,
                "status": "attention" if low else "normal",
                "healthScore": 90 if low else 94,
                "coalConsumptionTph": 151.8 if low else 148.2,
                "co2Tph": 371.2 if low else 362.4,
                "minTechnicalOutputMw": 180,
                "adjustableDownMw": 272,
                "adjustableUpMw": 148,
            },
            {
                "id": "unit-2",
                "name": "2号超临界燃煤机组",
                "ratedPowerMw": 600,
                "outputMw": 380 if degraded else 392,
                "loadRate": 63 if degraded else 65,
                "status": "warning" if degraded else "normal",
                "healthScore": 78 if degraded else 82,
                "coalConsumptionTph": 132.1 if degraded else 127.8,
                "co2Tph": 323.1 if degraded else 312.6,
                "minTechnicalOutputMw": 168,
                "adjustableDownMw": 212,
                "adjustableUpMw": 180,
            },
        ]

    def _devices(self) -> list[dict[str, Any]]:
        base = [
            ("锅炉本体", "锅炉系统", "主蒸汽温度", "566.2 °C", 186, 95),
            ("汽轮机高压缸", "汽轮机系统", "轴承振动", "3.2 mm/s", 148, 93),
            ("汽轮机中压缸", "汽轮机系统", "排汽温度", "42.6 °C", 96, 94),
            ("凝汽器", "汽轮机系统", "真空度", "-95.4 kPa", 82, 92),
            ("发电机定子", "发电机系统", "绕组温度", "78.4 °C", 92, 96),
            ("励磁系统", "发电机系统", "励磁电流", "1,208 A", 48, 95),
            ("锅炉给水泵A", "给水系统", "出口压力", "14.2 MPa", 74, 91),
            ("锅炉给水泵B", "给水系统", "出口压力", "14.0 MPa", 74, 94),
            ("磨煤机A", "制粉系统", "出口温度", "75.8 °C", 68, 92),
            ("磨煤机B", "制粉系统", "电流", "186 A", 68, 93),
            ("引风机A", "风烟系统", "电机温度", "72.1 °C", 58, 89),
            ("送风机A", "风烟系统", "风量", "1,086 kNm³/h", 58, 91),
            ("脱硫吸收塔", "环保系统", "出口 SO₂", "24.6 mg/Nm³", 66, 92),
            ("脱硝反应器", "环保系统", "出口 NOx", "31.2 mg/Nm³", 54, 94),
            ("主变压器", "电气系统", "绕组热点温度", "61.8 °C", 46, 97),
            ("厂用变压器", "电气系统", "负载率", "58 %", 42, 96),
        ]
        devices: list[dict[str, Any]] = []
        for unit_index in range(2):
            unit_id = f"unit-{unit_index + 1}"
            unit_name = f"{unit_index + 1}号机组"
            for index, (name, system, metric, value, signals, health) in enumerate(base):
                device_id = f"u{unit_index + 1}-device-{index + 1}"
                status = "正常"
                adjusted_health = health
                adjusted_value = value
                if unit_index == 1 and name == "汽轮机高压缸" and self.scenario == "设备轻度退化":
                    status, adjusted_health, adjusted_value = "预警", 78, "8.6 mm/s"
                if unit_index == 1 and name == "引风机A" and self.scenario == "设备轻度退化":
                    status, adjusted_health, adjusted_value = "关注", 84, "86.4 °C"
                if unit_index == 0 and name == "锅炉给水泵A" and self.scenario == "能效偏低":
                    status, adjusted_health, adjusted_value = "关注", 87, "13.6 MPa"
                devices.append(
                    {
                        "id": device_id,
                        "name": name if unit_index == 0 or name != "引风机A" else "引风机B",
                        "unitId": unit_id,
                        "unitName": unit_name,
                        "system": system,
                        "status": status,
                        "healthScore": adjusted_health,
                        "signalCount": signals,
                        "primaryMetric": metric,
                        "primaryValue": adjusted_value,
                    }
                )
        return devices

    def _points(self, devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
        now = self._now().strftime("%Y-%m-%d %H:%M:%S")
        point_suffixes = [
            ("振动 RMS", "mm/s", "3.2"),
            ("轴承温度", "°C", "68.4"),
            ("润滑油温", "°C", "46.8"),
            ("出口压力", "MPa", "14.2"),
            ("电机电流", "A", "186"),
            ("电机温度", "°C", "72.1"),
            ("入口风量", "kNm³/h", "1,086"),
            ("出口氧量", "%", "4.1"),
            ("主蒸汽温度", "°C", "566.2"),
            ("主蒸汽压力", "MPa", "24.1"),
            ("出口 SO₂", "mg/Nm³", "24.6"),
            ("出口 NOx", "mg/Nm³", "31.2"),
            ("绕组温度", "°C", "78.4"),
            ("负载率", "%", "58"),
        ]
        points: list[dict[str, Any]] = []
        for index, device in enumerate(devices):
            for offset in range(2 if index < 20 else 1):
                metric_index = (index + offset) % len(point_suffixes)
                name, unit, value = point_suffixes[metric_index]
                status = device["status"]
                if device["name"] == "汽轮机高压缸" and device["unitId"] == "unit-2" and self.scenario == "设备轻度退化":
                    if offset == 0:
                        name, unit, value, status = "轴承振动 RMS", "mm/s", "8.6", "预警"
                points.append(
                    {
                        "id": f"{device['id']}-point-{offset + 1}",
                        "deviceId": device["id"],
                        "unitName": device["unitName"],
                        "system": device["system"],
                        "deviceName": device["name"],
                        "name": name,
                        "value": value,
                        "unit": unit,
                        "status": status,
                        "updatedAt": now,
                    }
                )
        return points

    def _trend(self) -> list[dict[str, Any]]:
        now = self._now()
        low = self.scenario == "能效偏低"
        return [
            {
                "time": (now - timedelta(minutes=30 - index * 5)).strftime("%H:%M"),
                "output": round((820 + index * 9 - (index * 1.5 if low else 0)), 1),
                "baseline": 832,
                "renewable": 326 if self.scenario == "新能源消纳" else 120 + index * 34,
                "absorptionSpace": 312 if self.scenario == "新能源消纳" else 248 + index * 10,
                "coalConsumption": round(273 - index * 1.6 + (4 if low else 0), 1),
                "co2": round(670 - index * 2.6 + (10 if low else 0), 1),
            }
            for index in range(7)
        ]

    def snapshot(self) -> dict[str, Any]:
        units = self._units()
        devices = self._devices()
        points = self._points(devices)
        return {
            "plant": {
                "name": "示范火力发电厂",
                "totalRatedPowerMw": 1200,
                "onlineSince": "2026-09-04 08:00",
                "carbonFactor": 0.82,
            },
            "units": units,
            "metrics": {
                "totalOutputMw": sum(unit["outputMw"] for unit in units),
                "totalRatedPowerMw": 1200,
                "averageLoadRate": round(sum(unit["outputMw"] for unit in units) / 12, 1),
                "todayGenerationMwh": 18426 + self.tick * 8,
                "coalConsumptionTph": round(sum(unit["coalConsumptionTph"] for unit in units), 1),
                "co2Tph": round(sum(unit["co2Tph"] for unit in units), 1),
                "todayCo2T": 12842 + self.tick * 2,
                "todayReductionT": 386.4,
                "renewableOutputMw": 326 if self.scenario == "新能源消纳" else 286,
                "renewableAbsorptionRate": 96.2 if self.scenario == "新能源消纳" else 93.8,
                "availableDownRegulationMw": sum(unit["adjustableDownMw"] for unit in units),
                "carbonIntensity": 0.812 if self.scenario == "能效偏低" else 0.786,
                "renewableAbsorptionSpaceMw": 238 if self.scenario != "新能源消纳" else 312,
                "onlineMeasurementPoints": 2486,
            },
            "alarms": [
                {
                    "id": "alarm-bearing-2",
                    "time": self._now().strftime("%H:%M:%S"),
                    "unit": "2号机组",
                    "device": "汽轮机高压缸",
                    "metric": "轴承振动",
                    "value": "8.6 mm/s" if self.scenario == "设备轻度退化" else "6.4 mm/s",
                    "level": "预警" if self.scenario == "设备轻度退化" else "提示",
                    "status": "待诊断" if self.scenario == "设备轻度退化" else "已建议",
                },
                {
                    "id": "alarm-efficiency-1",
                    "time": (self._now() - timedelta(minutes=3)).strftime("%H:%M:%S"),
                    "unit": "1号机组",
                    "device": "锅炉给水泵A",
                    "metric": "出口压力",
                    "value": "13.6 MPa" if self.scenario == "能效偏低" else "14.2 MPa",
                    "level": "提示",
                    "status": "诊断中" if self.scenario == "能效偏低" else "已建议",
                },
            ],
            "devices": devices,
            "measurementPoints": points,
            "trend": self._trend(),
            "simulation": {
                "scenario": self.scenario,
                "mode": "simulation",
                "notice": "当前为可切换的仿真数据；接入真实后端时保持相同数据契约。",
            },
        }


simulation = PlantSimulation()
