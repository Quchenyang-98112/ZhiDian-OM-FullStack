"""Connector layer — integrations with external industrial systems."""

from shuangan.connectors.base import BaseConnector, ConnectorHealth, ConnectorRegistry
from shuangan.connectors.calendar import CalendarConnector
from shuangan.connectors.cmms import (
    ApiKeyHeaderAuth,
    AuthStrategy,
    BasicAuth,
    BearerAuth,
    CursorPagination,
    GenericCmmsConnector,
    MaximoConnector,
    NoAuth,
    NoPagination,
    OAuth2ClientCredentials,
    OffsetLimitPagination,
    PageNumberPagination,
    PaginationStrategy,
    SapPmConnector,
    UpKeepConnector,
)
from shuangan.connectors.comms.email import EmailConnector
from shuangan.connectors.comms.slack import SlackConnector
from shuangan.connectors.comms.telegram import CliChannel, TelegramConnector
from shuangan.connectors.docs.document_store import DocumentStoreConnector
from shuangan.connectors.iot import MqttConnector, OpcUaConnector

# Short public API aliases (see CLAUDE.md naming conventions)
Calendar = CalendarConnector
DocumentStore = DocumentStoreConnector
Email = EmailConnector
GenericCmms = GenericCmmsConnector
Maximo = MaximoConnector
MQTT = MqttConnector
OpcUA = OpcUaConnector
OpcUa = OpcUaConnector  # convenience alias (README-friendly casing)
SapPM = SapPmConnector
Slack = SlackConnector
Telegram = TelegramConnector
UpKeep = UpKeepConnector

__all__ = [
    "MQTT",
    "ApiKeyHeaderAuth",
    "AuthStrategy",
    "BaseConnector",
    "BasicAuth",
    "BearerAuth",
    "Calendar",
    "CalendarConnector",
    "CliChannel",
    "ConnectorHealth",
    "ConnectorRegistry",
    "CursorPagination",
    "DocumentStore",
    "DocumentStoreConnector",
    "Email",
    "EmailConnector",
    "GenericCmms",
    "GenericCmmsConnector",
    "Maximo",
    "MaximoConnector",
    "MqttConnector",
    "NoAuth",
    "NoPagination",
    "OAuth2ClientCredentials",
    "OffsetLimitPagination",
    "OpcUA",
    "OpcUa",
    "OpcUaConnector",
    "PageNumberPagination",
    "PaginationStrategy",
    "SapPM",
    "SapPmConnector",
    "Slack",
    "SlackConnector",
    "Telegram",
    "TelegramConnector",
    "UpKeep",
    "UpKeepConnector",
]
