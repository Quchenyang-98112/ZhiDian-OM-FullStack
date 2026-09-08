"""IoT / industrial protocol connectors for real-time sensor data."""

from shuangan.connectors.iot.mqtt import MqttConnector
from shuangan.connectors.iot.opcua import OpcUaConnector
from shuangan.connectors.iot.simulated import SimulatedSensorConnector

# Short public API aliases
MQTT = MqttConnector
OpcUA = OpcUaConnector

__all__ = [
    "MQTT",
    "MqttConnector",
    "OpcUA",
    "OpcUaConnector",
    "SimulatedSensorConnector",
]
