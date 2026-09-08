/**
 * OpenAI-compatible chat completions provider.
 * Covers OpenAI, xAI, Groq, and custom endpoints.
 */

import type { AIEngine, AIProvider, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';

export class OpenAICompatibleEngine implements AIEngine {
  readonly provider: AIProvider;
  readonly local = false;
  readonly label: string;
  readonly defaultBaseUrl: string;

  constructor(provider: AIProvider, label: string, defaultBaseUrl: string) {
    this.provider = provider;
    this.label = label;
    this.defaultBaseUrl = defaultBaseUrl;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(request: AIRequest, key: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    const response = await fetch(`${key.baseUrl || this.defaultBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.apiKey}`,
      },
      body: JSON.stringify({
        model: key.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.task },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`${this.provider} API error: ${response.status}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      meta: {
        provider: this.provider,
        model: key.model,
        mode: 'cloud',
        local: false,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  }
}
