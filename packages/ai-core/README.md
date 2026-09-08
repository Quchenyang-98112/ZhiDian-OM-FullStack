# @nexus-hems/ai-core

Unified local-first / hybrid AI orchestration layer for Nexus-HEMS.

## Purpose

This workspace contains the AI logic that is shared between the web dashboard
and future backends. It intentionally does **not** depend on React or Express
so that it can run in the main thread, a Web Worker, or a server context.

## Architecture

```text
Consumer
   │
   ▼
UnifiedAIOrchestrator
   │
   ├── buildStrategy(requestedMode, capabilities, hasCloudKey)
   │       → { mode, fallbackChain }
   ├── safety layer (sanitizePrompt + safety system prompt)
   └── AIProviderRegistry
           │
           ├── Cloud engines
           │   ├── OpenAICompatibleEngine (OpenAI, xAI, Groq, custom)
           │   ├── AnthropicEngine
           │   └── GeminiEngine
           │
           └── Local engines
               ├── WebLLMEngine          (WebGPU, large models)
               ├── TransformersEngine    (WebAssembly, small models)
               ├── OnnxEngine            (ONNX Runtime Web)
               ├── HeuristicEngine       (deterministic eco fallback)
               └── NoopLocalEngine       (placeholder)
```

## Usage

```ts
import {
  UnifiedAIOrchestrator,
  AIProviderRegistry,
  MemoryVaultKeyStore,
} from '@nexus-hems/ai-core';

const orchestrator = new UnifiedAIOrchestrator({
  preferences: { mode: 'hybrid', allowCloudFallback: true, allowLocalExecution: true, timeoutMs: 60_000 },
  registry: new AIProviderRegistry(),
  keyStore: new MemoryVaultKeyStore(),
});

await orchestrator.initialize();
const response = await orchestrator.ask({ task: 'How can I reduce my grid consumption?' });
console.log(response.text, response.meta);
```

## Local model configuration

Engines accept a config object in their constructor:

```ts
new WebLLMEngine({ model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC' });
new TransformersEngine({ model: 'Xenova/tiny-random-Llama-2', quantized: true });
new OnnxEngine({ modelUrl: '/models/model.onnx' });
```

## Safety

All requests pass through `sanitizeRequest` before dispatch. The safety system
prompt forbids the model from directly dispatching hardware commands.

## Testing

```bash
pnpm --filter @nexus-hems/ai-core test:run
```
