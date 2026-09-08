"""WeChat (微信) connector - 企业微信 API

支持企业微信应用和群机器人，用于维护技术人员与代理的交互。
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

__all__ = ["WeChatConnector"]


class WeChatConnector(BaseEnterpriseMessagingConnector):
    """WeChat (企业微信) 连接器

    支持企业微信应用、通讯录同步和群机器人。
    可以通过企业微信接收技术人员的消息，并通过代理进行回复。

    Args:
        corp_id: 企业 ID
        corp_secret: 应用的 Secret
        agent_id: 应用 AgentID
        token: 用于验证回调的 Token（可选）
        encoding_aes_key: 用于解密消息的 AES Key（可选）
        webhook: 群机器人 Webhook URL（可选）
        allowed_user_ids: 可选的用户 ID 白名单

    群机器人示例:
        ```python
        wechat = WeChatConnector(
            webhook="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
        )
        await wechat.connect()
        ```

    企业应用示例:
        ```python
        wechat = WeChatConnector(
            corp_id="wwxxx",
            corp_secret="xxx",
            agent_id=1000001
        )
        await wechat.connect()
        ```
    """

    def __init__(
        self,
        *,
        corp_id: Optional[str] = None,
        corp_secret: Optional[str] = None,
        agent_id: Optional[int] = None,
        token: Optional[str] = None,
        encoding_aes_key: Optional[str] = None,
        webhook: Optional[str] = None,
        allowed_user_ids: list[str] | None = None,
    ) -> None:
        super().__init__(allowed_user_ids=allowed_user_ids)
        self._corp_id = corp_id
        self._corp_secret = corp_secret
        self._agent_id = agent_id
        self._token = token
        self._encoding_aes_key = encoding_aes_key
        self._webhook = webhook
        self._handler: MessageHandler | None = None

    async def _authenticate(self) -> None:
        """验证配置并获取访问令牌（企业应用模式）。"""
        if not any([self._webhook, self._corp_id]):
            raise ConnectorError("webhook 或 corp_id 必须提供一个")

        if self._corp_id and self._corp_secret:
            await self._get_access_token()

    async def _get_access_token(self) -> None:
        """获取企业应用的访问令牌。"""
        if not self._corp_id or not self._corp_secret:
            return

        url = "https://qyapi.weixin.qq.com/cgi-bin/gettoken"
        params = {
            "corpid": self._corp_id,
            "corpsecret": self._corp_secret,
        }

        try:
            if not self._http_client:
                raise ConnectorError("HTTP client not initialised")

            response = await self._http_client.get(url, params=params)
            response.raise_for_status()
            result = response.json()

            if result.get("errcode") != 0:
                raise ConnectorError(f"Failed to get access token: {result.get('errmsg')}")

            self._access_token = result.get("access_token")
            expires_in = result.get("expires_in", 7200)
            import time
            self._token_expires_at = time.time() + expires_in - 300  # 提前5分钟刷新

            logger.debug("access_token_obtained", connector="WeChatConnector")
        except Exception as exc:
            logger.error("token_failed", error=str(exc), connector="WeChatConnector")
            raise ConnectorError(f"Failed to get access token: {exc}") from exc

    async def send_message(
        self,
        chat_id: str | int,
        text: str,
        msgtype: str = "text",
    ) -> None:
        """发送消息到企业微信

        Args:
            chat_id: 用户 ID 或部门 ID
            text: 消息内容
            msgtype: 消息类型（text/markdown 等）

        Raises:
            ConnectorError: 如果未连接或发送失败
        """
        self._ensure_connected()
        if not self._http_client:
            raise ConnectorError("HTTP client not initialised")

        if self._webhook:
            await self._send_webhook_message(text, msgtype)
        else:
            await self._send_application_message(str(chat_id), text, msgtype)

    async def _send_webhook_message(self, text: str, msgtype: str) -> None:
        """通过群机器人 Webhook 发送消息"""
        if not self._webhook:
            return

        payload = {
            "msgtype": msgtype,
            msgtype: {"content": text},
        }

        try:
            response = await self._http_client.post(self._webhook, json=payload)
            response.raise_for_status()
            result = response.json()

            if result.get("errcode") != 0:
                raise ConnectorError(f"WeChat API error: {result.get('errmsg')}")

            logger.debug(
                "message_sent",
                connector="WeChatConnector",
                msgtype="webhook",
            )
        except Exception as exc:
            logger.error("send_failed", error=str(exc), connector="WeChatConnector")
            raise ConnectorError(f"Failed to send message: {exc}") from exc

    async def _send_application_message(self, chat_id: str, text: str, msgtype: str) -> None:
        """通过企业应用发送消息"""
        if not self._corp_id or not self._agent_id:
            raise ConnectorError("corp_id and agent_id required for application mode")

        await self._ensure_access_token()
        url = "https://qyapi.weixin.qq.com/cgi-bin/message/send"
        params = {"access_token": self._access_token}

        payload = {
            "touser": chat_id,
            "agentid": self._agent_id,
            "msgtype": msgtype,
            msgtype: {"content": text},
        }

        try:
            response = await self._http_client.post(url, params=params, json=payload)
            response.raise_for_status()
            result = response.json()

            if result.get("errcode") != 0:
                raise ConnectorError(f"WeChat API error: {result.get('errmsg')}")

            logger.debug(
                "message_sent",
                connector="WeChatConnector",
                msgtype="application",
            )
        except Exception as exc:
            logger.error("send_failed", error=str(exc), connector="WeChatConnector")
            raise ConnectorError(f"Failed to send message: {exc}") from exc

    async def listen(
        self,
        handler: MessageHandler,
        *,
        host: str = "0.0.0.0",
        port: int = 8080,
    ) -> None:
        """监听企业微信消息（启动 Webhook 回调服务器）

        启动一个 HTTP 服务器接收企业微信的回调消息。
        需要在企业微信管理后台配置回调 URL 为:
        http://your-server:{port}/wechat/callback

        支持:
        - GET: 验证回调 URL 有效性（企业微信验证）
        - POST: 接收消息回调

        Args:
            handler: 处理消息的异步回调函数
            host: 监听地址
            port: 监听端口
        """
        self._ensure_connected()
        self._handler = handler
        logger.info("starting_webhook_server", connector="WeChatConnector", host=host, port=port)

        server = await asyncio.start_server(
            self._handle_wechat_request,
            host,
            port,
        )

        async with server:
            await server.serve_forever()

    async def _handle_wechat_request(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """处理企业微信 HTTP 回调请求"""
        try:
            # Read request
            data = await reader.read(65536)
            request_text = data.decode("utf-8", errors="replace")

            # Parse request line
            lines = request_text.split("\r\n")
            request_line = lines[0] if lines else ""
            method = request_line.split()[0] if request_line else "GET"

            if method == "GET":
                # WeChat URL verification
                # In production, this should verify the signature
                response_body = "echostr_placeholder"
                response = (
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/plain\r\n"
                    f"Content-Length: {len(response_body)}\r\n"
                    "\r\n"
                    + response_body
                )
            elif method == "POST":
                # Parse WeChat callback message
                body_start = request_text.find("\r\n\r\n")
                body = request_text[body_start + 4:] if body_start >= 0 else ""

                message_text = ""
                if body:
                    try:
                        import xml.etree.ElementTree as ET
                        root = ET.fromstring(body)
                        content_elem = root.find("Content")
                        from_elem = root.find("FromUserName")
                        if content_elem is not None:
                            message_text = content_elem.text or ""
                        user_id = from_elem.text if from_elem is not None else "unknown"

                        # Check user whitelist
                        if self._allowed_user_ids and user_id not in self._allowed_user_ids:
                            logger.warning("unauthorized_user", user_id=user_id)
                            response_body = "success"
                        else:
                            # Call handler
                            from shuangan.connectors.comms.types import IncomingMessage
                            msg = IncomingMessage(
                                text=message_text,
                                user_id=user_id,
                                chat_id=user_id,
                            )
                            if self._handler:
                                await self._handler(msg)
                            response_body = "success"
                    except Exception as exc:
                        logger.error("message_parse_error", error=str(exc))
                        response_body = "success"

                response = (
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/plain\r\n"
                    f"Content-Length: {len(response_body)}\r\n"
                    "\r\n"
                    + response_body
                )
            else:
                response_body = "Method Not Allowed"
                response = (
                    "HTTP/1.1 405 Method Not Allowed\r\n"
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
WeChat = WeChatConnector
