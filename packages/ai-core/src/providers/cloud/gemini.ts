/**
 * Google Gemini generateContent provider.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';

export class GeminiEngine implements AIEngine {
  readonly provider = 'google' as const;
  readonly local = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(request: AIRequest, key: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    const baseUrl = key.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const response = await fetch(`${baseUrl}/models/${key.model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: request.systemPrompt
          ? { parts: [{ text: request.systemPrompt }] }
          : undefined,
        contents: [{ parts: [{ text: request.task }] }],
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 1024,
          topK: 40,
          topP: 0.95,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
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
