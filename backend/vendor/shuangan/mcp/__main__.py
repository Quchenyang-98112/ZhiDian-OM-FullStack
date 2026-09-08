"""CLI entrypoint for the shuangan MCP server.

Usage:
    python -m shuangan.mcp --config shuangan.yaml --transport stdio
    python -m shuangan.mcp --config shuangan.yaml --transport streamable-http --port 8000
"""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        description="shuangan MCP Server",
        prog="python -m shuangan.mcp",
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Path to shuangan.yaml configuration file",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "streamable-http"],
        default="stdio",
        help="MCP transport (default: stdio)",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Host for HTTP transport")
    parser.add_argument("--port", type=int, default=8000, help="Port for HTTP transport")
    args = parser.parse_args()

    from shuangan.config.loader import load_yaml
    from shuangan.config.schema import shuanganConfig
    from shuangan.mcp.server import serve

    try:
        raw = load_yaml(args.config)
    except FileNotFoundError:
        print(f"Error: config file not found: {args.config}", file=sys.stderr)
        sys.exit(1)

    config = shuanganConfig.model_validate(raw)
    serve(config, transport=args.transport, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
