/** Provider-neutral boundary for future LLM-backed diagnosis and decision flows. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/**
 * Calls an OpenAI-compatible chat endpoint. The UI can use this boundary for
 * diagnosis, decision support, and report generation without coupling pages
 * to a vendor. Production deployments should proxy this request server-side.
 */
export async function callConfiguredLlm(
  config: LlmConfig,
  messages: LlmMessage[],
  signal?: AbortSignal,
): Promise<LlmResponse> {
  if (!config.baseUrl.trim() || !config.model.trim() || !config.apiKey.trim()) {
    throw new Error('LLM provider is not configured');
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 1200,
    }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`LLM request failed (${response.status})`);
  const payload = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const usage = payload.usage
    ? {
        ...(payload.usage.prompt_tokens !== undefined
          ? { promptTokens: payload.usage.prompt_tokens }
          : {}),
        ...(payload.usage.completion_tokens !== undefined
          ? { completionTokens: payload.usage.completion_tokens }
          : {}),
      }
    : undefined;
  return {
    content: payload.choices?.[0]?.message?.content ?? '',
    ...(payload.model ? { model: payload.model } : {}),
    ...(usage ? { usage } : {}),
  };
}
