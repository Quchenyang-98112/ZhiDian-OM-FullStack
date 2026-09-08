/**
 * WebLLM engine for large local models using WebGPU.
 *
 * Loads an MLC-compatible model and runs it entirely in the browser. The
 * default model is a small chat model; override via config for production.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';
import { isLocalLlmEnabled } from './local-llm-flag.ts';

export interface WebLLMEngineConfig {
  model?: string;
  chatOpts?: Record<string, unknown>;
  appConfig?: Record<string, unknown>;
}

export const DEFAULT_WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

// Deferred peer package (F-03/ADR-029). Typed as `string` (not a literal) so the
// bundler/type-checker do not require it to be installed; `@vite-ignore` keeps
// Vite from analysing the specifier. Only imported when the build flag is set.
const WEBLLM_MODULE: string = '@mlc-ai/web-llm';

interface MLCModule {
  CreateMLCEngine: (
    model: string,
    chatOpts: Record<string, unknown>,
    appConfig: Record<string, unknown>,
  ) => Promise<unknown>;
}

export class WebLLMEngine implements AIEngine {
  readonly provider = 'webllm' as const;
  readonly local = true;
  private engine: unknown | undefined;
  private readonly config: WebLLMEngineConfig;

  constructor(config: WebLLMEngineConfig = {}) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!isLocalLlmEnabled()) return false;
    if (typeof navigator === 'undefined') return false;
    return 'gpu' in navigator && navigator.gpu != null;
  }

  async load(): Promise<void> {
    if (this.engine) return;
    // Deferred peer package: only import when explicitly opted in (F-03/ADR-029).
    if (!isLocalLlmEnabled()) return;
    const { CreateMLCEngine } = (await import(/* @vite-ignore */ WEBLLM_MODULE)) as MLCModule;
    this.engine = await CreateMLCEngine(
      this.getModel(),
      this.config.chatOpts ?? {},
      this.config.appConfig ?? {},
    );
  }

  async generate(request: AIRequest, _key?: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    try {
      await this.load();
    } catch (error) {
      return {
        text: `WebLLM model could not be loaded. ${error instanceof Error ? error.message : String(error)}`,
        meta: {
          provider: this.provider,
          model: this.getModel(),
          mode: 'local',
          local: true,
          latencyMs: Math.round(performance.now() - startedAt),
        },
      };
    }

    const messages = this.buildMessages(request);
    const completions = (this.engine as Record<string, unknown>).chat as Record<string, unknown>;
    const result = (await (completions.create as (opts: unknown) => Promise<unknown>)({
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1024,
    })) as { choices?: Array<{ message?: { content?: string } }> };

    return {
      text: result.choices?.[0]?.message?.content ?? '',
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
    return this.config.model ?? DEFAULT_WEBLLM_MODEL;
  }

  private buildMessages(request: AIRequest): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    for (const m of request.messages ?? []) {
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: request.task });
    return messages;
  }
}
