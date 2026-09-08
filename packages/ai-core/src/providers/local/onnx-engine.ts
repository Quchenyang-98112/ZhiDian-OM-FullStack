/**
 * ONNX Runtime Web engine.
 *
 * Phase 2a provides the loading scaffold. A concrete model must be supplied
 * via configuration; until then the engine reports availability based on
 * WebAssembly support and returns a guidance message.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';
import { isLocalLlmEnabled } from './local-llm-flag.ts';

// Deferred peer package (F-03/ADR-029); see webllm-engine.ts for the rationale.
// Loaded dynamically (never as a top-level import) so the file evaluates fine
// when onnxruntime-web is not installed.
const ONNX_MODULE: string = 'onnxruntime-web';

interface OnnxRuntimeModule {
  InferenceSession: {
    create: (modelUrl: string, options: Record<string, unknown>) => Promise<unknown>;
  };
}

export interface OnnxEngineConfig {
  modelUrl?: string;
  executionProviders?: string[];
}

export class OnnxEngine implements AIEngine {
  readonly provider = 'onnx' as const;
  readonly local = true;
  private session: unknown | undefined;
  private readonly config: OnnxEngineConfig;

  constructor(config: OnnxEngineConfig = {}) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!isLocalLlmEnabled()) return false;
    return typeof WebAssembly !== 'undefined';
  }

  async load(): Promise<void> {
    if (this.session) return;
    // Never touch the deferred peer package unless explicitly opted in — keeps
    // disabled deployments from importing a dependency that is no longer shipped.
    if (!isLocalLlmEnabled()) return;
    if (!this.config.modelUrl) {
      return;
    }
    const ort = (await import(/* @vite-ignore */ ONNX_MODULE)) as OnnxRuntimeModule;
    this.session = await ort.InferenceSession.create(this.config.modelUrl, {
      executionProviders: this.config.executionProviders ?? ['wasm'],
    });
  }

  async generate(request: AIRequest, _key?: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    await this.load();

    if (!this.session) {
      return {
        text: `${request.task}\n\n(ONNX engine is loaded but no model is configured yet. Add an ONNX model URL in Settings > AI to enable inference.)`,
        meta: {
          provider: this.provider,
          model: 'onnx-runtime-web',
          mode: 'local',
          local: true,
          latencyMs: Math.round(performance.now() - startedAt),
        },
      };
    }

    // Placeholder: actual tokenization and inference depend on the model schema.
    // Returning a guidance response keeps the engine safe and testable.
    return {
      text: `${request.task}\n\n(ONNX inference executed; structured output decoding is not yet implemented for this model.)`,
      meta: {
        provider: this.provider,
        model: this.config.modelUrl ?? 'onnx-runtime-web',
        mode: 'local',
        local: true,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  }
}
