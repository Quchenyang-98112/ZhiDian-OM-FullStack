"""Feishu (飞书) connector - 飞书机器人 API

支持飞书企业自建应用和商店应用，用于维护技术人员与代理的交互。
"""

from __future__ import annotations

import asyncio
import json
from typing import Optional

import structlog

from shuangan.connectors.comms.base_enterprise import BaseEnterpriseMessagingConnector
from shuangan.connectors.comms.types import MessageHandler
from shuangan.exceptions import ConnectorError

logger = structlog.get_logger(__name__)

__all__ = ["FeishuConnector"]


class FeishuConnector(BaseEnterpriseMessagingConnector):
    """Feishu (飞书) 机器人连接器

    支持飞书企业自建应用和机器人应用。可以通过飞书接收技术人员的消息，
    并通过代理进行回复。

    Args:
        app_id: 飞书应用 AppID
        app_secret: 飞书应用 AppSecret
        encrypt_key: 事件加密密钥（可选）
        verification_token: 验证令牌（可选）
        allowed_user_ids: 可选的用户 ID 白名单

    示例:
        ```python
        feishu = FeishuConnector(
            app_id="cli_xxx",
            app_secret="xxx"
        )
        await feishu.connect()
        ```
    """

    def __init__(
        self,
        *,
        app_id: str = "",
        app_secret: str = "",
        encrypt_key: Optional[str] = None,
        verification_token: Optional[str] = None,
        allowed_user_ids: list[str] | None = None,
    ) -> None:
        super().__init__(allowed_user_ids=allowed_user_ids)
        self._app_id = app_id
        self._app_secret = app_secret
        self._encrypt_key = encrypt_key
        self._verification_token = verification_token
        self._handler: MessageHandler | None = None

    async def _authenticate(self) -> None:
        """验证配置并获取租户访问令牌。"""
        if not self._app_id or not self._app_secret:
            raise ConnectorError("app_id and app_secret are required for FeishuConnector")

        await self._get_access_token()

    async def _get_access_token(self) -> None:
        """获取租户访问令牌。"""
        if not self._app_id or not self._app_secret:
            return

        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"

        payload = {
            "app_id": self._app_id,
            "app_secret": self._app_secret,
        }

        try:
            if not self._http_client:
                raise ConnectorError("HTTP client not initialised")

            response = await self._http_client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()

            if result.get("code") != 0:
                raise ConnectorError(f"Failed to get tenant access token: {result.get('msg')}")

            self._access_token = result.get("tenant_access_token")
            expires_in = result.get("expire", 7200)
            import time
            self._token_expires_at = time.time() + expires_in - 300  # 提前5分钟刷新

            logger.debug("tenant_token_obtained", connector="FeishuConnector")
        except Exception as exc:
            logger.error("token_failed", error=str(exc), connector="FeishuConnector")
            raise ConnectorError(f"Failed to get tenant access token: {exc}") from exc

    async def send_message(
        self,
        chat_id: str | int,
        text: str,
        msgtype: str = "text",
    ) -> None:
        """发送消息到飞书

        Args:
            chat_id: 飞书对话 ID 或用户 open_id
            text: 消息内容
            msgtype: 消息类型（text/rich_text 等）

        Raises:
            ConnectorError: 如果未连接或发送失败
        """
        self._ensure_connected()
        if not self._http_client:
            raise ConnectorError("HTTP client not initialised")

        await self._ensure_access_token()
        url = "https://open.feishu.cn/open-apis/im/v1/messages"
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json; charset=utf-8",
        }

        payload = {
            "receive_id": str(chat_id),
            "msg_type": msgtype,
            "content": json.dumps({"text": text}),
        }

        try:
            response = await self._http_client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            result = response.json()

            if result.get("code") != 0:
                raise ConnectorError(f"Feishu API error: {result.get('msg')}")

            logger.debug(
                "message_sent",
                connector="FeishuConnector",
            )
        except Exception as exc:
            logger.error("send_failed", error=str(exc), connector="FeishuConnector")
            raise ConnectorError(f"Failed to send message: {exc}") from exc

    async def listen(
        self,
        handler: MessageHandler,
        *,
        host: str = "0.0.0.0",
        port: int = 8080,
    ) -> None:
        """监听飞书消息（启动 Webhook 回调服务器）

        启动一个 HTTP 服务器接收飞书的事件回调。
        需要在飞书开放平台配置事件回调 URL 为:
        http://your-server:{port}/feishu/callback

        支持飞书的事件订阅验证（challenge）和消息回调。

        Args:
            handler: 处理消息的异步回调函数
            host: 监听地址
            port: 监听端口
        """
        self._ensure_connected()
        self._handler = handler
        logger.info("starting_webhook_server", connector="FeishuConnector", host=host, port=port)

        server = await asyncio.start_server(
            self._handle_feishu_request,
            host,
            port,
        )

        async with server:
            await server.serve_forever()

    async def _handle_feishu_request(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """处理飞书 HTTP 回调请求"""
        try:
            data = await reader.read(65536)
            request_text = data.decode("utf-8", errors="replace")

            lines = request_text.split("\r\n")
            request_line = lines[0] if lines else ""
            method = request_line.split()[0] if request_line else "GET"

            if method == "POST":
                body_start = request_text.find("\r\n\r\n")
                body = request_text[body_start + 4:] if body_start >= 0 else ""

                if body:
                    try:
                        payload = json.loads(body)

                        # Handle Feishu URL verification challenge
                        if payload.get("type") == "url_verification":
                            challenge = payload.get("challenge", "")
                            response_body = json.dumps({"challenge": challenge})
                            response = (
                                "HTTP/1.1 200 OK\r\n"
                                "Content-Type: application/json\r\n"
                                f"Content-Length: {len(response_body)}\r\n"
                                "\r\n"
                                + response_body
                            )
                            writer.write(response.encode("utf-8"))
                            await writer.drain()
                            return

                        # Handle event callback
                        event = payload.get("event", {})
                        message_content = event.get("message", {})

                        if message_content:
                            msg_type = message_content.get("message_type", "text")
                            content_str = message_content.get("content", "{}")

                            text = ""
                            try:
                                content_data = json.loads(content_str) if isinstance(content_str, str) else content_str
                                text = content_data.get("text", "")
                            except (json.JSONDecodeError, AttributeError):
                                text = str(content_str)

                            sender_id = event.get("sender", {}).get("sender_id", {}).get("user_id", "unknown")
                            chat_id = message_content.get("chat_id", "unknown")

                            # Check user whitelist
                            if self._allowed_user_ids and sender_id not in self._allowed_user_ids:
                                logger.warning("unauthorized_user", user_id=sender_id)
                            else:
                                from shuangan.connectors.comms.types import IncomingMessage
                                msg = IncomingMessage(
                                    text=text,
                                    user_id=sender_id,
                                    chat_id=chat_id,
                                )
                                if self._handler:
                                    await self._handler(msg)

                        response_body = json.dumps({"code": 0})
                    except Exception as exc:
                        logger.error("message_parse_error", error=str(exc))
                        response_body = json.dumps({"code": -1})
                else:
                    response_body = json.dumps({"code": 0})

                response = (
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {len(response_body)}\r\n"
                    "\r\n"
                    + response_body
                )
            else:
                response_body = "OK"
                response = (
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/plain\r\n"
                    f"Content-Length: {len(response_body)}\r\n"
                    "\r\n"
                    + response_body
                )

            writer.write(response.encode("utf-8"))
            await writer.drain()
        except Exception as exc:
            logger.error("request_handling_error", error=str(exc))
        finally:
            writer.close()


# 别名
Feishu = FeishuConnector
Lark = FeishuConnector
