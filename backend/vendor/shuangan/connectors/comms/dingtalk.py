"""DingTalk (钉钉) connector - 钉钉机器人 API

支持企业内部机器人和自定义机器人，用于维护技术人员与代理的交互。
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import base64
import json
import time
from typing import Optional
from urllib.parse import quote_plus

import structlog

from shuangan.connectors.comms.base_enterprise import BaseEnterpriseMessagingConnector
from shuangan.connectors.comms.types import MessageHandler
from shuangan.exceptions import ConnectorError

logger = structlog.get_logger(__name__)

__all__ = ["DingTalkConnector"]


class DingTalkConnector(BaseEnterpriseMessagingConnector):
    """DingTalk (钉钉) 机器人连接器

    支持企业内部机器人和自定义机器人。可以通过钉钉接收技术人员的消息，
    并通过代理进行回复。

    Args:
        webhook: 自定义机器人的 webhook URL（用于自定义机器人）
        secret: 自定义机器人的签名密钥（用于自定义机器人）
        app_key: 企业内部机器人的 AppKey
        app_secret: 企业内部机器人的 AppSecret
        agent_id: 企业内部机器人的 AgentID
        allowed_user_ids: 可选的用户 ID 白名单

    自定义机器人示例:
        ```python
        dingtalk = DingTalkConnector(
            webhook="https://oapi.dingtalk.com/robot/send?access_token=xxx",
            secret="SECxxx"
        )
        await dingtalk.connect()
        ```

    企业内部机器人示例:
        ```python
        dingtalk = DingTalkConnector(
            app_key="xxx",
            app_secret="xxx",
            agent_id=123456
        )
        await dingtalk.connect()
        ```
    """

    def __init__(
        self,
        *,
        webhook: Optional[str] = None,
        secret: Optional[str] = None,
        app_key: Optional[str] = None,
        app_secret: Optional[str] = None,
        agent_id: Optional[int] = None,
        allowed_user_ids: list[str] | None = None,
    ) -> None:
        super().__init__(allowed_user_ids=allowed_user_ids)
        self._webhook = webhook
        self._secret = secret
        self._app_key = app_key
        self._app_secret = app_secret
        self._agent_id = agent_id
        self._handler: MessageHandler | None = None

    async def _authenticate(self) -> None:
        """验证配置并获取访问令牌（企业内部机器人模式）。"""
        if not any([self._webhook, self._app_key]):
            raise ConnectorError("webhook 或 app_key 必须提供一个")

        if self._app_key and self._app_secret:
            await self._get_access_token()

    async def _get_access_token(self) -> None:
        """获取企业内部机器人的访问令牌。"""
        if not self._app_key or not self._app_secret:
            return

        url = "https://oapi.dingtalk.com/gettoken"
        params = {
            "appkey": self._app_key,
            "appsecret": self._app_secret,
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
            self._token_expires_at = time.time() + expires_in - 300  # 提前5分钟刷新

            logger.debug("access_token_obtained", connector="DingTalkConnector")
        except Exception as exc:
            logger.error("token_failed", error=str(exc), connector="DingTalkConnector")
            raise ConnectorError(f"Failed to get access token: {exc}") from exc

    async def send_message(
        self,
        chat_id: str | int,
        text: str,
        msgtype: str = "text",
    ) -> None:
        """发送消息到钉钉

        Args:
            chat_id: 群聊 ID 或用户 ID（聊天类型）
            text: 消息内容
            msgtype: 消息类型（text/markdown 等）

        Raises:
            ConnectorError: 如果未连接或发送失败
        """
        self._ensure_connected()
        if not self._http_client:
            raise ConnectorError("HTTP client not initialised")

        if self._webhook:
            await self._send_custom_robot_message(text, msgtype)
        else:
            await self._send_enterprise_message(str(chat_id), text, msgtype)

    async def _send_custom_robot_message(self, text: str, msgtype: str) -> None:
        """通过自定义机器人发送消息"""
        if not self._webhook:
            return

        url = self._webhook
        if self._secret:
            sign, timestamp = self._generate_sign()
            url = f"{self._webhook}&timestamp={timestamp}&sign={sign}"

        payload = {
            "msgtype": msgtype,
            msgtype: {"content": text},
        }

        try:
            response = await self._http_client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()

            if result.get("errcode") != 0:
                raise ConnectorError(f"DingTalk API error: {result.get('errmsg')}")

            logger.debug(
                "message_sent",
                connector="DingTalkConnector",
                msgtype="custom_robot",
            )
        except Exception as exc:
            logger.error("send_failed", error=str(exc), connector="DingTalkConnector")
            raise ConnectorError(f"Failed to send message: {exc}") from exc

    async def _send_enterprise_message(self, chat_id: str, text: str, msgtype: str) -> None:
        """通过企业内部机器人发送消息"""
        if not self._app_key or not self._agent_id:
            raise ConnectorError("app_key and agent_id required for enterprise mode")

        await self._ensure_access_token()
        url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2"
        params = {"access_token": self._access_token}

        payload = {
            "agent_id": self._agent_id,
            "userid_list": chat_id,
            "msg": json.dumps({
                "msgtype": msgtype,
                msgtype: {"content": text},
            }),
        }

        try:
            response = await self._http_client.post(url, params=params, json=payload)
            response.raise_for_status()
            result = response.json()

            if result.get("errcode") != 0:
                raise ConnectorError(f"DingTalk API error: {result.get('errmsg')}")

            logger.debug(
                "message_sent",
                connector="DingTalkConnector",
                msgtype="enterprise_robot",
            )
        except Exception as exc:
            logger.error("send_failed", error=str(exc), connector="DingTalkConnector")
            raise ConnectorError(f"Failed to send message: {exc}") from exc

    def _generate_sign(self) -> tuple[str, int]:
        """生成自定义机器人的签名

        Returns:
            (签名, 时间戳)
        """
        if not self._secret:
            return "", 0

        timestamp = int(round(time.time() * 1000))
        secret_enc = self._secret.encode("utf-8")
        string_to_sign = f"{timestamp}\n{self._secret}".encode("utf-8")
        hmac_code = hmac.new(secret_enc, string_to_sign, digestmod=hashlib.sha256).digest()
        sign = quote_plus(base64.b64encode(hmac_code))
        return sign, timestamp

    async def listen(
        self,
        handler: MessageHandler,
        *,
        host: str = "0.0.0.0",
        port: int = 8080,
    ) -> None:
        """监听钉钉消息（启动 Webhook 回调服务器）

        启动一个 HTTP 服务器接收钉钉机器人的回调消息。
        需要在钉钉开放平台配置回调 URL 为:
        http://your-server:{port}/dingtalk/callback

        Args:
            handler: 处理消息的异步回调函数
            host: 监听地址
            port: 监听端口
        """
        self._ensure_connected()
        self._handler = handler
        logger.info("starting_webhook_server", connector="DingTalkConnector", host=host, port=port)

        server = await asyncio.start_server(
            self._handle_dingtalk_request,
            host,
            port,
        )

        async with server:
            await server.serve_forever()

    async def _handle_dingtalk_request(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """处理钉钉 HTTP 回调请求"""
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
                        # DingTalk robot callback format
                        msg_type = payload.get("msgtype", "text")
                        text_content = ""
                        if msg_type == "text":
                            text_content = payload.get("text", {}).get("content", "")

                        sender_id = payload.get("senderStaffId") or payload.get("senderId", "unknown")
                        conversation_id = payload.get("conversationId", "unknown")

                        # Check user whitelist
                        if self._allowed_user_ids and sender_id not in self._allowed_user_ids:
                            logger.warning("unauthorized_user", user_id=sender_id)
                            response_body = json.dumps({"msgtype": "empty"})
                        else:
                            from shuangan.connectors.comms.types import IncomingMessage
                            msg = IncomingMessage(
                                text=text_content.strip(),
                                user_id=sender_id,
                                chat_id=conversation_id,
                            )
                            if self._handler:
                                await self._handler(msg)
                            response_body = json.dumps({"msgtype": "empty"})
                    except Exception as exc:
                        logger.error("message_parse_error", error=str(exc))
                        response_body = json.dumps({"msgtype": "empty"})
                else:
                    response_body = json.dumps({"msgtype": "empty"})

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
DingTalk = DingTalkConnector
