/**
 * Provider registry: maps provider IDs to AIEngine implementations.
 * Phase 2a registers cloud providers plus local/heuristic engines.
 */

import type { AIEngine, AIProvider } from '../types.ts';
import { AnthropicEngine } from './cloud/anthropic.ts';
import { GeminiEngine } from './cloud/gemini.ts';
import { OpenAICompatibleEngine } from './cloud/openai-compatible.ts';
import { HeuristicEngine } from './local/heuristic-engine.ts';
import { NoopLocalEngine } from './local/noop.ts';
import { OnnxEngine } from './local/onnx-engine.ts';
import { TransformersEngine } from './local/transformers-engine.ts';
import { WebLLMEngine } from './local/webllm-engine.ts';

export class AIProviderRegistry {
  private readonly engines = new Map<AIProvider, AIEngine>();

  constructor() {
    this.register(new OpenAICompatibleEngine('openai', 'OpenAI', 'https://api.openai.com/v1'));
    this.register(new OpenAICompatibleEngine('xai', 'xAI', 'https://api.x.ai/v1'));
    this.register(new OpenAICompatibleEngine('groq', 'Groq', 'https://api.groq.com/openai/v1'));
    this.register(new AnthropicEngine());
    this.register(new GeminiEngine());
    this.register(new WebLLMEngine());
    this.register(new TransformersEngine());
    this.register(new OnnxEngine());
    this.register(new HeuristicEngine());
    this.register(new NoopLocalEngine());
  }

  register(engine: AIEngine): void {
    this.engines.set(engine.provider, engine);
  }

  get(provider: AIProvider): AIEngine {
    const engine = this.engines.get(provider);
    if (!engine) {
      throw new Error(`AI provider ${provider} is not registered`);
    }
    return engine;
  }

  list(): AIProvider[] {
    return Array.from(this.engines.keys());
  }
}
