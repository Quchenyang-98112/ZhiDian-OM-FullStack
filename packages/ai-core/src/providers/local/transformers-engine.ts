/**
 * Transformers.js engine for small local models.
 *
 * Loads a text-generation pipeline and caches it in the browser. The default
 * model is a tiny model suitable for smoke-testing; production deployments
 * should override it via config.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';
import { isLocalLlmEnabled } from './local-llm-flag.ts';

export interface TransformersEngineConfig {
  model?: string;
  task?: 'text-generation' | 'feature-extraction';
  quantized?: boolean;
}

export const DEFAULT_TRANSFORMERS_MODEL = 'Xenova/tiny-random-Llama-2';

// Deferred peer package (F-03/ADR-029); see webllm-engine.ts for the rationale.
const TRANSFORMERS_MODULE: string = '@xenova/transformers';

interface TransformersModule {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>;
}

export class TransformersEngine implements AIEngine {
  readonly provider = 'transformers' as const;
  readonly local = true;
  private pipeline: unknown | undefined;
  private readonly config: TransformersEngineConfig;

  constructor(config: TransformersEngineConfig = {}) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!isLocalLlmEnabled()) return false;
    return typeof WebAssembly !== 'undefined';
  }

  async load(): Promise<void> {
    if (this.pipeline) return;
    // Deferred peer package: only import when explicitly opted in (F-03/ADR-029).
    if (!isLocalLlmEnabled()) return;
    const { pipeline } = (await import(
      /* @vite-ignore */ TRANSFORMERS_MODULE
    )) as TransformersModule;
    this.pipeline = await pipeline(this.config.task ?? 'text-generation', this.getModel(), {
      quantized: this.config.quantized ?? true,
    });
  }

  async generate(request: AIRequest, _key?: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    try {
      await this.load();
    } catch (error) {
      return {
        text: `Local model could not be loaded. ${error instanceof Error ? error.message : String(error)}`,
        meta: {
          provider: this.provider,
          model: this.getModel(),
          mode: 'local',
          local: true,
          latencyMs: Math.round(performance.now() - startedAt),
        },
      };
    }

    const prompt = this.buildPrompt(request);
    const result = (await (
      this.pipeline as { call: (text: string, options?: unknown) => Promise<unknown> }
    ).call(prompt, {
      max_new_tokens: request.maxTokens ?? 256,
      temperature: request.temperature ?? 0.7,
    })) as Array<{ generated_text?: string }> | { generated_text?: string };

    const text = Array.isArray(result)
      ? (result[0]?.generated_text ?? '')
      : ((result as { generated_text?: string }).generated_text ?? '');

    return {
      text: text.replace(prompt, '').trim(),
      meta: {
        provider: this.provider,
        model: this.getModel(),
        mode: 'local',
        local: true,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  }

  private getModel(): string {
    return this.config.model ?? DEFAULT_TRANSFORMERS_MODEL;
  }

  private buildPrompt(request: AIRequest): string {
    const parts: string[] = [];
    if (request.systemPrompt) parts.push(request.systemPrompt);
    for (const m of request.messages ?? []) {
      parts.push(`${m.role}: ${m.content}`);
    }
    parts.push(`user: ${request.task}`);
    return parts.join('\n');
  }
}
