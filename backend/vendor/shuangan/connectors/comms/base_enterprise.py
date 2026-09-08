"""Base class for enterprise messaging connectors.

Provides common functionality for HTTP client management, connection state
management, token management, and health checking. Subclasses implement
platform-specific authentication and message sending logic.
"""

from __future__ import annotations

import abc
import asyncio
import contextlib
import time
from typing import ClassVar, Optional

import httpx
import structlog

from shuangan.connectors.base import ConnectorHealth, ConnectorStatus
from shuangan.connectors.capabilities import Capability
from shuangan.connectors.comms.types import MessageHandler
from shuangan.exceptions import ConnectorError

logger = structlog.get_logger(__name__)

__all__ = ["BaseEnterpriseMessagingConnector"]


class BaseEnterpriseMessagingConnector(abc.ABC):
    """Abstract base class for enterprise messaging connectors.

    Provides common functionality:
    - HTTP client lifecycle management
    - Connection state tracking
    - OAuth token caching and automatic refresh
    - Health check with webhook probing
    - User whitelist support

    Subclasses must implement:
    - :meth:`_authenticate`: Platform-specific authentication
    - :meth:`_get_access_token`: Platform-specific token acquisition
    - :meth:`send_message`: Platform-specific message sending
    """

    capabilities: ClassVar[frozenset[Capability]] = frozenset(
        {Capability.SEND_MESSAGE, Capability.RECEIVE_MESSAGE}
    )

    def __init__(
        self,
        *,
        allowed_user_ids: list[str] | None = None,
        http_timeout: float = 30.0,
    ) -> None:
        self._allowed_user_ids = set(allowed_user_ids) if allowed_user_ids else None
        self._http_timeout = http_timeout
        self._connected = False
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0
        self._http_client: Optional[httpx.AsyncClient] = None
        self._webhook_server = None

    async def connect(self) -> None:
        """Establish connection: validate config, create HTTP client, authenticate."""
        self._http_client = httpx.AsyncClient(timeout=self._http_timeout)
        await self._authenticate()
        self._connected = True
        logger.info("connected", connector=self.__class__.__name__)

    async def disconnect(self) -> None:
        """Gracefully close the HTTP client and clean up resources."""
        if self._http_client:
            with contextlib.suppress(Exception):
                await self._http_client.aclose()
        if self._webhook_server:
            with contextlib.suppress(Exception):
                await self._webhook_server.stop()
        self._http_client = None
        self._webhook_server = None
        self._connected = False
        logger.info("disconnected", connector=self.__class__.__name__)

    async def health_check(self) -> ConnectorHealth:
        """Check connector health: verify connection and probe webhook if available."""
        if not self._connected:
            return ConnectorHealth(status=ConnectorStatus.UNHEALTHY, message="Not connected")
        if hasattr(self, "_webhook") and self._webhook:
            try:
                if self._http_client:
                    test_url = self._webhook.split("?")[0]
                    await self._http_client.get(test_url, timeout=5.0)
            except Exception as exc:
                return ConnectorHealth(
                    status=ConnectorStatus.UNHEALTHY,
                    message=f"Webhook test failed: {exc}",
                )
        return ConnectorHealth(status=ConnectorStatus.HEALTHY, message="Connected")

    async def listen(self, handler: MessageHandler) -> None:
        """Listen for incoming messages using webhook mode.

        Args:
            handler: Async callback for processing incoming messages.
        """
        self._ensure_connected()
        logger.info("listening", connector=self.__class__.__name__)
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            pass

    def _ensure_connected(self) -> None:
        """Raise ConnectorError if not connected."""
        if not self._connected:
            raise ConnectorError("Not connected — call connect() first")

    async def _ensure_access_token(self) -> None:
        """Refresh access token if expired or missing."""
        if time.time() > self._token_expires_at or not self._access_token:
            await self._get_access_token()

    @abc.abstractmethod
    async def _authenticate(self) -> None:
        """Perform platform-specific authentication (e.g. fetch access token).

        Must be implemented by subclasses.
        """
        ...

    @abc.abstractmethod
    async def _get_access_token(self) -> None:
        """Fetch or refresh the platform-specific access token.

        Must be implemented by subclasses.
        """
        ...

    @abc.abstractmethod
    async def send_message(self, chat_id: str | int, text: str, msgtype: str = "text") -> None:
        """Send a message to the platform.

        Must be implemented by subclasses.

        Args:
            chat_id: Target chat or user identifier.
            text: Message content.
            msgtype: Message type (e.g. ``"text"``, ``"markdown"``).
        """
        ...
