"""LLM abstraction layer — provider-agnostic interface over LiteLLM."""

from shuangan.llm.provider import LLMProvider
from shuangan.llm.tools import BUILTIN_TOOLS, make_tool

__all__ = ["BUILTIN_TOOLS", "LLMProvider", "make_tool"]
