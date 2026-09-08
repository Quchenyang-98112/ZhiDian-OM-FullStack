"""LLM provider — async wrapper around LiteLLM for maintenance-aware generation.

    支持国内主流大模型提供商：
    - qwen (通义千问)
    - wenxin (文心一言) 
    - zhipu (智谱AI)
    - hunyuan (腾讯混元)
    - deepseek (DeepSeek)
    - ollama (本地模型)
    - openai, anthropic 等国际提供商
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import structlog

logger = structlog.get_logger(__name__)

if TYPE_CHECKING:
    from shuangan.observability.tracing import ActionTracer


class LLMProvider:
    """Provider-agnostic LLM interface.

    Wraps LiteLLM to provide async ``complete()`` and
    ``complete_with_tools()`` methods.  ShuangAn's agent layer uses
    this instead of calling LLM libraries directly.

    Args:
        model: Provider and model identifier (e.g. ``"openai:gpt-4o"``,
            ``"qwen:qwen-plus"``, ``"ollama:llama3"``).
        temperature: Sampling temperature.
        max_tokens: Maximum tokens in the response.
        tracer: Optional ActionTracer for cost/token instrumentation.
    """

    def __init__(
        self,
        model: str = "openai:gpt-4o",
        *,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        request_timeout: float = 120.0,
        tracer: ActionTracer | None = None,
    ) -> None:
        self.model = model.replace(":", "/", 1)
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.request_timeout = request_timeout
        self._tracer = tracer

    async def complete(
        self,
        messages: list[dict[str, str]],
        *,
        conversation_id: str = "",
        **kwargs: Any,
    ) -> str:
        """Send a chat completion request and return the response text.

        Args:
            messages: Chat messages in OpenAI format.
            conversation_id: Conversation identifier for tracing.
            **kwargs: Extra parameters forwarded to LiteLLM.

        Returns:
            The assistant's response text.
        """
        try:
            import litellm
        except ImportError:
            msg = (
                "litellm is required for LLM calls. "
                "Install it with: pip install shuangan-ai[litellm]"
            )
            raise ImportError(msg) from None

        response = await self._call_with_retry(
            lambda: litellm.acompletion(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                timeout=self.request_timeout,
                **kwargs,
            )
        )
        content = str(response.choices[0].message.content)
        self._emit_trace(response, conversation_id=conversation_id)
        return content

    async def complete_with_tools(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]],
        *,
        conversation_id: str = "",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send a chat completion with tool/function definitions.

        Args:
            messages: Chat messages in OpenAI format.
            tools: Tool definitions (OpenAI function calling schema).
            conversation_id: Conversation identifier for tracing.
            **kwargs: Extra parameters forwarded to LiteLLM.

        Returns:
            The full response dict including any tool calls.
        """
        try:
            import litellm
        except ImportError:
            msg = (
                "litellm is required for LLM calls. "
                "Install it with: pip install shuangan-ai[litellm]"
            )
            raise ImportError(msg) from None

        response = await self._call_with_retry(
            lambda: litellm.acompletion(
                model=self.model,
                messages=messages,
                tools=tools,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                timeout=self.request_timeout,
                **kwargs,
            )
        )
        message = response.choices[0].message
        self._emit_trace(response, conversation_id=conversation_id)
        return {
            "content": message.content,
            "tool_calls": message.tool_calls,
        }

    async def _call_with_retry(
        self,
        fn: Any,
        *,
        max_retries: int = 3,
        base_delay: float = 1.0,
    ) -> Any:
        """Call an async function with exponential backoff retry.

        Retries on transient errors: rate limits, service unavailable,
        timeouts, and connection errors.
        """
        last_exc: Exception | None = None

        for attempt in range(max_retries):
            try:
                return await fn()
            except Exception as exc:
                last_exc = exc
                # Check if it's a retryable error
                exc_name = type(exc).__name__
                is_retryable = any(
                    kw in exc_name.lower()
                    for kw in ("ratelimit", "rate_limit", "serviceunavailable",
                               "service_unavailable", "timeout", "connection",
                               "503", "429", "apiconnection")
                )

                if not is_retryable or attempt == max_retries - 1:
                    raise

                delay = base_delay * (2 ** attempt)
                logger.warning(
                    "llm_retry",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    delay=delay,
                    error=str(exc),
                    error_type=exc_name,
                )
                await asyncio.sleep(delay)

        raise last_exc  # type: ignore[misc]

    def _emit_trace(self, response: Any, *, conversation_id: str = "") -> None:
        """Extract token/cost info from a LiteLLM response and record a trace."""
        if self._tracer is None:
            return

        from shuangan.observability.cost import estimate_cost
        from shuangan.observability.tracing import TraceEntry

        usage = getattr(response, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        total_tokens = prompt_tokens + completion_tokens

        cost = estimate_cost(self.model, prompt_tokens, completion_tokens)

        entry = TraceEntry(
            action="llm_call",
            operation="complete",
            model=self.model,
            conversation_id=conversation_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            usd_cost=cost,
        )
        self._tracer.record(entry)
