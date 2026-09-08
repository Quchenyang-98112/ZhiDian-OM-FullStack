# AI Providers Setup Guide

Nexus-HEMS integrates a multi-provider AI client for energy optimization, predictive forecasting, and natural language analysis.

> **Source:** `apps/web/src/core/aiClient.ts` · **Key storage:** `apps/web/src/lib/ai-keys.ts`
>
> **Security note:** API keys are **never stored in env vars or plain text**. They are encrypted with AES-GCM 256-bit and stored in IndexedDB using the browser Web Crypto API.

---

## Supported Providers

| Provider | Models | Use Case | Free Tier | Local |
|----------|--------|----------|-----------|-------|
| **OpenAI** | GPT-4o, GPT-4o mini | Optimization reasoning, NL analysis | No | No |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Haiku | Energy forecasting, safety analysis | No | No |
| **Google Gemini** | Gemini 2.0 Flash, Gemini Pro | MPC optimization assistant | Yes (limited) | No |
| **xAI (Grok)** | Grok-3, Grok-3 mini | Real-time analysis | No | No |
| **Groq** | Llama 3.3 Instruct, Mixtral | Ultra-fast inference, edge analysis | Yes | No |
| **Ollama** | Any local model (llama3, mistral) | On-premise, no data leaves network | Yes | **Yes** |
| **Custom (BYOK)** | Any OpenAI-compatible endpoint | Self-hosted / enterprise | — | Optional |

---

## Configuring an AI Provider

1. Navigate to **Settings → AI & Optimization → AI Provider**
2. Select your provider from the dropdown
3. Enter your API key (auto-saved encrypted, never visible again)
4. Click **Test Connection** to verify
5. Select your preferred **model** from the detected list
6. Enable AI features:
   - **Predictive Forecasting** — AI-assisted PV/load prediction
   - **Optimization Suggestions** — Natural language optimizer recommendations
   - **Anomaly Detection** — AI detects unusual consumption patterns

---

## Provider Setup Details

### OpenAI

1. Create an account at [platform.openai.com](https://platform.openai.com)
2. Generate an API key: **API Keys → Create new secret key**
3. Recommended model: **gpt-4o-mini** (best price/performance for HEMS use case)
4. Set a **Usage Limit** in OpenAI settings to avoid unexpected bills

```
API Base URL: https://api.openai.com/v1
Model: gpt-4o-mini (recommended) or gpt-4o (higher accuracy)
```

### Anthropic (Claude)

1. Create an account at [console.anthropic.com](https://console.anthropic.com)
2. **API Keys → Create Key**
3. Recommended model: **claude-3-haiku-20240307** (fastest, cheapest for optimization loops)

```
API Base URL: https://api.anthropic.com/v1
Model: claude-3-haiku-20240307 (recommended) or claude-3-5-sonnet-20241022
```

### Google Gemini

1. Create API key at [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API key → Create API key in new project**
3. Free tier: 15 requests/min, 1M tokens/day

```
API Base URL: https://generativelanguage.googleapis.com/v1beta
Model: gemini-2.0-flash (recommended) or gemini-1.5-pro
```

### xAI (Grok)

1. Access at [console.x.ai](https://console.x.ai)
2. Generate API key under **API Keys**

```
API Base URL: https://api.x.ai/v1
Model: grok-3-mini (recommended for energy analysis)
```

### Groq (Ultra-Fast Inference)

Groq uses custom LPU hardware for near-instant inference — ideal for real-time HEMS suggestions.

1. Create account at [console.groq.com](https://console.groq.com)
2. **API Keys → Create API Key**
3. Free tier: generous token limits

```
API Base URL: https://api.groq.com/openai/v1
Model: llama-3.3-70b-versatile or mixtral-8x7b-32768
```

### Ollama (Local / On-Premise)

Run AI entirely on your local machine — no API key needed, no data leaves your network.

**Install Ollama:**
```bash
# Linux / macOS
curl -fsSL https://ollama.ai/install.sh | sh

# Start server
ollama serve

# Pull a model (choose one based on your hardware RAM)
ollama pull llama3.2:3b    # 2GB RAM — fast, basic reasoning
ollama pull llama3.1:8b    # 5GB RAM — good balance
ollama pull llama3.1:70b   # 40GB RAM — best quality
ollama pull mistral        # 4GB RAM — good for structured output
```

**Configure in Nexus-HEMS:**
```
Provider: Ollama
API Base URL: http://localhost:11434/v1
Model: llama3.2:3b (or whichever you pulled)
API Key: (leave blank)
```

> **Docker users:** If Nexus-HEMS runs in Docker and Ollama on the host, use `http://host.docker.internal:11434/v1` as the base URL.

### Custom BYOK (Bring Your Own Key)

For any OpenAI-compatible endpoint (LM Studio, LocalAI, text-generation-webui, vLLM, etc.):

```
Provider: Custom
API Base URL: https://your-server.local:8080/v1
Model: (enter model name exactly as your server expects)
API Key: (as required by your server)
```

---

## AI Features Reference

### Predictive Forecasting

- **Source:** `apps/web/src/lib/predictive-ai.ts`
- Input: Historical energy data (last 30 days from IndexedDB) + weather forecast (Open-Meteo)
- Output: 24-hour PV production forecast, load forecast, recommended battery schedule
- Trigger: Runs every 6 hours, or manually via **Optimization → Refresh Forecast**

### MPC Optimizer Integration

- **Source:** `apps/web/src/lib/optimizer.ts`
- AI provides probability distributions for PV/load uncertainty
- LP solver uses AI forecasts as deterministic inputs for the 24-slot day-ahead schedule
- Without AI: uses historical average + Open-Meteo solar irradiance directly

### Anomaly Detection

The AI monitors energy patterns and alerts when:
- Consumption is >2σ above the 30-day daily average
- PV production is unexpectedly low (shading event detection)
- Battery SoC not reaching expected level overnight

### PII Sanitization

Before any data is sent to cloud AI providers, the `pii-sanitizer` module (ADR-008) strips:
- Location data converted to only climate zone (e.g., "Central Europe")
- Device names replaced with generic labels ("inverter_1", "wallbox_2")
- Exact energy prices replaced with relative values (cheap/normal/expensive)

---

## Privacy & Security

| Aspect | Details |
|--------|---------|
| **Key storage** | AES-GCM 256-bit, IndexedDB, browser-only |
| **Key visibility** | Keys are write-once — never displayed after saving |
| **Data sent to AI** | Energy timeseries, weather data, settings — never PII or location |
| **Local option** | Ollama: zero data leaves the network |
| **Key deletion** | Settings → AI → Delete All Keys → clears from IndexedDB |
| **Workers** | AI inference runs in a Web Worker (`ai-worker.ts`) — never blocks UI thread |

---

## Troubleshooting AI

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "API key invalid" | Key expired or copy error | Re-enter key in Settings |
| Very slow responses | Large model, low hardware | Switch to smaller model or Groq |
| "Quota exceeded" | Free tier limit reached | Upgrade plan or use Groq/Ollama |
| AI suggestions not appearing | Feature disabled | Enable in Settings → AI Features |
| Ollama "connection refused" | Server not running | `ollama serve` on host |

---

*See also: [Tariff-Providers-Setup.md](./Tariff-Providers-Setup.md) · `apps/web/src/core/aiClient.ts` · ADR-008*
