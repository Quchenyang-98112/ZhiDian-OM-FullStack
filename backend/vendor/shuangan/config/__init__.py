"""Configuration loading with YAML and environment variable support."""

from shuangan.config.loader import load_config
from shuangan.config.schema import (
    ChannelConfig,
    ConnectorConfig,
    LLMConfig,
    shuanganConfig,
    PlantConfig,
)

# Alias for backward compatibility
Config = shuanganConfig

__all__ = [
    "ChannelConfig",
    "ConnectorConfig",
    "LLMConfig",
    "shuanganConfig",
    "Config",  # alias
    "PlantConfig",
    "load_config",
]
