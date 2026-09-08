/**
 * Anthropic Messages API provider.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';

export class AnthropicEngine implements AIEngine {
  readonly provider = 'anthropic' as const;
  readonly local = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(request: AIRequest, key: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    const response = await fetch(`${key.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: key.model,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.task }],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    return {
      text: data.content?.[0]?.text ?? '',
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
