"""TrendPredictor — statistical trend analysis and prediction for sensor data.

Provides:
- Linear regression for trend direction and rate
- Threshold crossing prediction (when will value exceed threshold?)
- Anomaly detection using statistical methods
- Confidence intervals for predictions
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class TrendPrediction:
    """Result of a trend prediction analysis."""

    asset_id: str
    parameter: str
    current_value: float
    trend_direction: str  # "increasing", "decreasing", "stable"
    trend_rate: float  # units per hour
    predicted_value_24h: float
    predicted_value_7d: float
    threshold_crossing_time: datetime | None  # when threshold will be crossed
    confidence: str  # "high", "medium", "low"
    r_squared: float  # goodness of fit (0-1)
    recommendation: str


@dataclass
class AnomalyDetection:
    """Result of anomaly detection."""

    asset_id: str
    parameter: str
    timestamp: datetime
    value: float
    expected_range: tuple[float, float]
    severity: str  # "warning", "critical"
    z_score: float
    message: str


class TrendPredictor:
    """Predictive analytics for sensor time-series data.

    Uses simple linear regression for trend analysis and statistical
    methods for anomaly detection. Future versions may integrate
    scikit-learn or deep learning models.

    Example:
        ```python
        predictor = TrendPredictor()

        readings = [
            {"timestamp": "2026-04-10T02:30:00Z", "value": 4.1},
            {"timestamp": "2026-04-10T02:45:00Z", "value": 5.3},
            {"timestamp": "2026-04-10T03:00:00Z", "value": 6.8},
        ]

        prediction = predictor.predict_trend(
            asset_id="P-201",
            parameter="vibration_velocity_mm_s",
            readings=readings,
            threshold=11.0,
        )

        print(f"24h预测: {prediction.predicted_value_24h:.1f}")
        print(f"阈值 crossing: {prediction.threshold_crossing_time}")
        ```
    """

    def __init__(self) -> None:
        self._history: dict[str, list[dict[str, Any]]] = {}

    def predict_trend(
        self,
        *,
        asset_id: str,
        parameter: str,
        readings: list[dict[str, Any]],
        threshold: float | None = None,
        lower_threshold: float | None = None,
        unit: str = "",
    ) -> TrendPrediction | None:
        """Analyze trend and predict future values.

        Args:
            asset_id: Asset identifier.
            parameter: Sensor parameter name.
            readings: List of {timestamp, value} dicts.
            threshold: Optional upper threshold to predict crossing time.
            lower_threshold: Optional lower threshold to predict downward crossing time.
            unit: Measurement unit for logging.

        Returns:
            TrendPrediction or None if insufficient data.
        """
        if len(readings) < 2:
            logger.warning(
                "insufficient_data_for_prediction",
                asset_id=asset_id,
                parameter=parameter,
                readings_count=len(readings),
            )
            return None

        # Parse timestamps and values
        parsed = []
        for r in readings:
            ts_str = r.get("timestamp", "")
            if isinstance(ts_str, str):
                ts_str = ts_str.replace("Z", "+00:00")
                ts = datetime.fromisoformat(ts_str)
            else:
                ts = ts_str
            parsed.append((ts, float(r.get("value", r.get("sensors", {}).get(parameter, 0)))))

        parsed.sort(key=lambda x: x[0])

        # Convert to hours since first reading for regression
        base_time = parsed[0][0]
        x_hours = [(ts - base_time).total_seconds() / 3600 for ts, _ in parsed]
        y_values = [v for _, v in parsed]

        n = len(x_hours)
        x_mean = sum(x_hours) / n
        y_mean = sum(y_values) / n

        # Linear regression: y = slope * x + intercept
        numerator = sum((x_hours[i] - x_mean) * (y_values[i] - y_mean) for i in range(n))
        denominator = sum((x - x_mean) ** 2 for x in x_hours)

        if denominator == 0:
            slope = 0.0
        else:
            slope = numerator / denominator

        intercept = y_mean - slope * x_mean

        # R-squared
        ss_res = sum((y_values[i] - (slope * x + intercept)) ** 2 for i, x in enumerate(x_hours))
        ss_tot = sum((y - y_mean) ** 2 for y in y_values)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        current_value = y_values[-1]

        # Determine trend direction
        if abs(slope) < 0.01:
            trend_direction = "stable"
        elif slope > 0:
            trend_direction = "increasing"
        else:
            trend_direction = "decreasing"

        # Predict future values
        hours_24 = 24.0
        hours_7d = 24.0 * 7

        predicted_24h = current_value + slope * hours_24
        predicted_7d = current_value + slope * hours_7d

        # Predict threshold crossing (relative to now)
        threshold_crossing = None

        # Upper threshold crossing (increasing trend)
        if threshold is not None and slope > 0 and current_value < threshold:
            hours_to_cross = (threshold - current_value) / slope
            if hours_to_cross > 0:
                threshold_crossing = datetime.now(timezone.utc) + timedelta(hours=hours_to_cross)

        # Lower threshold crossing (decreasing trend)
        if lower_threshold is not None and slope < 0 and current_value > lower_threshold:
            hours_to_cross = (current_value - lower_threshold) / abs(slope)
            if hours_to_cross > 0:
                threshold_crossing = datetime.now(timezone.utc) + timedelta(hours=hours_to_cross)

        # Confidence based on R-squared and data points
        if r_squared > 0.8 and n >= 5:
            confidence = "high"
        elif r_squared > 0.5 and n >= 3:
            confidence = "medium"
        else:
            confidence = "low"

        # Generate recommendation
        recommendation = self._generate_recommendation(
            parameter=parameter,
            current_value=current_value,
            trend_direction=trend_direction,
            trend_rate=slope,
            threshold=threshold,
            lower_threshold=lower_threshold,
            threshold_crossing=threshold_crossing,
            confidence=confidence,
            unit=unit,
        )

        result = TrendPrediction(
            asset_id=asset_id,
            parameter=parameter,
            current_value=current_value,
            trend_direction=trend_direction,
            trend_rate=slope,
            predicted_value_24h=predicted_24h,
            predicted_value_7d=predicted_7d,
            threshold_crossing_time=threshold_crossing,
            confidence=confidence,
            r_squared=r_squared,
            recommendation=recommendation,
        )

        logger.info(
            "trend_prediction",
            asset_id=asset_id,
            parameter=parameter,
            direction=trend_direction,
            rate=slope,
            confidence=confidence,
            r_squared=round(r_squared, 3),
        )

        return result

    def detect_anomalies(
        self,
        *,
        asset_id: str,
        parameter: str,
        readings: list[dict[str, Any]],
        z_threshold: float = 2.5,
    ) -> list[AnomalyDetection]:
        """Detect statistical anomalies in sensor readings.

        Uses Z-score method: values beyond z_threshold standard
        deviations from the mean are flagged.

        Args:
            asset_id: Asset identifier.
            parameter: Sensor parameter name.
            readings: List of {timestamp, value} dicts.
            z_threshold: Z-score threshold for anomaly detection.

        Returns:
            List of detected anomalies.
        """
        if len(readings) < 3:
            return []

        values = []
        timestamps = []
        for r in readings:
            ts_str = r.get("timestamp", "")
            if isinstance(ts_str, str):
                ts_str = ts_str.replace("Z", "+00:00")
                ts = datetime.fromisoformat(ts_str)
            else:
                ts = ts_str
            val = float(r.get("value", r.get("sensors", {}).get(parameter, 0)))
            values.append(val)
            timestamps.append(ts)

        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
        std = variance ** 0.5

        if std == 0:
            return []

        anomalies = []
        for i, (ts, val) in enumerate(zip(timestamps, values)):
            z_score = abs(val - mean) / std
            if z_score > z_threshold:
                expected_low = mean - z_threshold * std
                expected_high = mean + z_threshold * std
                severity = "critical" if z_score > z_threshold + 1 else "warning"

                anomalies.append(
                    AnomalyDetection(
                        asset_id=asset_id,
                        parameter=parameter,
                        timestamp=ts,
                        value=val,
                        expected_range=(expected_low, expected_high),
                        severity=severity,
                        z_score=z_score,
                        message=(
                            f"{parameter}={val:.2f} 超出正常范围 "
                            f"[{expected_low:.2f}, {expected_high:.2f}] "
                            f"(Z-score={z_score:.1f})"
                        ),
                    )
                )

        logger.info(
            "anomaly_detection_complete",
            asset_id=asset_id,
            parameter=parameter,
            anomalies_found=len(anomalies),
        )

        return anomalies

    def _generate_recommendation(
        self,
        *,
        parameter: str,
        current_value: float,
        trend_direction: str,
        trend_rate: float,
        threshold: float | None,
        lower_threshold: float | None,
        threshold_crossing: datetime | None,
        confidence: str,
        unit: str,
    ) -> str:
        """Generate a human-readable maintenance recommendation."""
        parts = []

        if trend_direction == "stable":
            parts.append(f"{parameter} 保持稳定 ({current_value:.1f} {unit})")
        elif trend_direction == "increasing":
            parts.append(
                f"{parameter} 呈上升趋势: {current_value:.1f} {unit}, "
                f"每小时增加 {trend_rate:.2f} {unit}"
            )
        else:
            parts.append(
                f"{parameter} 呈下降趋势: {current_value:.1f} {unit}, "
                f"每小时减少 {abs(trend_rate):.2f} {unit}"
            )

        if threshold is not None and threshold_crossing:
            hours_until = (threshold_crossing - datetime.now(timezone.utc)).total_seconds() / 3600
            if hours_until > 0:
                if hours_until < 24:
                    parts.append(
                        f"预计 {hours_until:.1f} 小时后超过上限阈值 ({threshold} {unit}) — 建议立即安排维护"
                    )
                elif hours_until < 168:  # 7 days
                    days_until = hours_until / 24
                    parts.append(
                        f"预计 {days_until:.1f} 天后超过上限阈值 ({threshold} {unit}) — 建议本周安排维护"
                    )
                else:
                    parts.append(
                        f"预计 {(hours_until / 24):.1f} 天后超过上限阈值 ({threshold} {unit})"
                    )

        if lower_threshold is not None and threshold_crossing and trend_direction == "decreasing":
            hours_until = (threshold_crossing - datetime.now(timezone.utc)).total_seconds() / 3600
            if hours_until > 0:
                if hours_until < 24:
                    parts.append(
                        f"预计 {hours_until:.1f} 小时后跌破下限阈值 ({lower_threshold} {unit}) — 建议立即安排维护"
                    )
                elif hours_until < 168:  # 7 days
                    days_until = hours_until / 24
                    parts.append(
                        f"预计 {days_until:.1f} 天后跌破下限阈值 ({lower_threshold} {unit}) — 建议本周安排维护"
                    )
                else:
                    parts.append(
                        f"预计 {(hours_until / 24):.1f} 天后跌破下限阈值 ({lower_threshold} {unit})"
                    )

        if confidence == "low":
            parts.append("(预测置信度较低，建议增加数据采集频率)")

        return "; ".join(parts)

    def store_reading(
        self,
        asset_id: str,
        parameter: str,
        timestamp: datetime,
        value: float,
    ) -> None:
        """Store a reading for historical analysis."""
        key = f"{asset_id}:{parameter}"
        if key not in self._history:
            self._history[key] = []

        self._history[key].append({
            "timestamp": timestamp,
            "value": value,
        })

        # Keep last 1000 readings per parameter
        if len(self._history[key]) > 1000:
            self._history[key] = self._history[key][-1000:]

    def get_history(
        self,
        asset_id: str,
        parameter: str,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Retrieve stored readings."""
        key = f"{asset_id}:{parameter}"
        history = self._history.get(key, [])
        return history[-limit:]
