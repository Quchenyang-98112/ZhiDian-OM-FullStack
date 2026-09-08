/**
 * llm-worker.ts — Off-main-thread local LLM inference.
 *
 * Runs local models (WebLLM, Transformers.js, ONNX, heuristic) in a dedicated
 * worker so that model loading and token generation do not block the UI.
 *
 * The worker does not access cloud provider keys; those are handled in the main
 * thread via the ai-core orchestrator with DexieVaultKeyStore.
 */

import {
  type AIProvider,
  AIProviderRegistry,
  type AIRequest,
  MemoryVaultKeyStore,
  UnifiedAIOrchestrator,
} from '@nexus-hems/ai-core';
import * as Comlink from 'comlink';
import type { LLMWorkerAPI, LLMWorkerRequest, LLMWorkerResponse } from './worker-types';

const registry = new AIProviderRegistry();
const keyStore = new MemoryVaultKeyStore();

let orchestrator: UnifiedAIOrchestrator | undefined;

async function getOrchestrator(): Promise<UnifiedAIOrchestrator> {
  if (!orchestrator) {
    orchestrator = new UnifiedAIOrchestrator({
      preferences: {
        mode: 'local',
        allowCloudFallback: false,
        allowLocalExecution: true,
        timeoutMs: 300_000,
      },
      registry,
      keyStore,
    });
    await orchestrator.initialize();
  }
  return orchestrator;
}

async function generate(request: LLMWorkerRequest): Promise<LLMWorkerResponse> {
  const o = await getOrchestrator();
  const provider = request.provider ?? (await o.buildStrategy()).fallbackChain[0] ?? 'heuristic';
  const engine = registry.get(provider as AIProvider);

  const aiRequest: AIRequest = { task: request.task };
  if (request.systemPrompt) {
    aiRequest.systemPrompt = request.systemPrompt;
  }
  if (request.messages) {
    aiRequest.messages = request.messages;
  }
  aiRequest.temperature = request.temperature ?? 0.7;
  aiRequest.maxTokens = request.maxTokens ?? 1024;

  const response = await engine.generate(aiRequest);
  return {
    text: response.text,
    provider: response.meta.provider,
    model: response.meta.model,
    latencyMs: response.meta.latencyMs,
  };
}

const api: LLMWorkerAPI = { generate };

Comlink.expose(api);
