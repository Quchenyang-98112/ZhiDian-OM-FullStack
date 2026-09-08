export interface BackendKnowledgeDocument {
  id: string;
  name: string;
  fileType: string;
  size: string;
  folder: string;
  system: string;
  status: '未解析' | '解析中' | '已解析' | '解析失败';
  chunks: number;
  updatedAt: string;
  source?: string;
  path?: string;
}

export interface BackendLlmConfig {
  configured: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKeyMasked?: string;
}

export const backendApi = {
  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const init: RequestInit = { headers: { Accept: 'application/json' } };
    if (signal) init.signal = signal;
    const response = await fetch(path, init);
    if (!response.ok) throw new Error(`后端接口响应异常（${response.status}）`);
    return (await response.json()) as T;
  },

  async send<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    if (!response.ok) {
      let detail = `后端接口响应异常（${response.status}）`;
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload.detail) detail = payload.detail;
      } catch {
        // Keep the status-based message when the response is not JSON.
      }
      throw new Error(detail);
    }
    return (await response.json()) as T;
  },
};

export async function syncLlmConfigToBackend(config: {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}): Promise<BackendLlmConfig> {
  return backendApi.send<BackendLlmConfig>('/api/llm/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(config),
  });
}
