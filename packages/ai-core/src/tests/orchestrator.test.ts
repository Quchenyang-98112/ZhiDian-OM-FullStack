import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, UnifiedAIOrchestrator } from '../orchestrator.ts';
import { AIProviderRegistry } from '../providers/registry.ts';
import type { AIEngine, AIRequest, AIResponse } from '../types.ts';
import { MemoryVaultKeyStore } from '../vault/key-store.ts';

class FailingEngine implements AIEngine {
  readonly provider = 'openai' as const;
  readonly local = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(): Promise<AIResponse> {
    throw new Error('network error');
  }
}

class WorkingEngine implements AIEngine {
  readonly provider = 'openai' as const;
  readonly local = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return {
      text: `ok: ${request.task}`,
      meta: {
        provider: 'openai',
        model: 'test',
        mode: 'cloud',
        local: false,
        latencyMs: 1,
      },
    };
  }
}

describe('UnifiedAIOrchestrator', () => {
  it('throws when no provider is available', async () => {
    const registry = new AIProviderRegistry();
    registry.register(new FailingEngine());
    const orchestrator = new UnifiedAIOrchestrator({
      preferences: { ...DEFAULT_PREFERENCES, mode: 'cloud' },
      registry,
      keyStore: new MemoryVaultKeyStore(),
    });

    await expect(orchestrator.ask({ task: 'hello' })).rejects.toThrow(
      'No AI provider available for the requested mode',
    );
  });

  it('uses a configured cloud key and returns a response', async () => {
    const registry = new AIProviderRegistry();
    registry.register(new WorkingEngine());
    const keyStore = new MemoryVaultKeyStore();
    await keyStore.set('openai', { apiKey: 'sk-test', model: 'test', baseUrl: '' });

    const orchestrator = new UnifiedAIOrchestrator({
      preferences: { ...DEFAULT_PREFERENCES, mode: 'cloud' },
      registry,
      keyStore,
    });

    const response = await orchestrator.ask({ task: 'hello' });
    expect(response.text).toContain('ok:');
    expect(response.meta.provider).toBe('openai');
  });

  it('resolves effective mode based on capabilities', async () => {
    const orchestrator = new UnifiedAIOrchestrator({
      preferences: DEFAULT_PREFERENCES,
      registry: new AIProviderRegistry(),
      keyStore: new MemoryVaultKeyStore(),
      capabilities: {
        webgpu: true,
        webgl: true,
        webAssembly: true,
        simd: true,
        threads: true,
        hardwareConcurrency: 8,
        deviceMemoryGb: 8,
        estimatedGpuMemoryMb: undefined,
        indexedDb: true,
        localStorage: true,
        recommendedMode: 'hybrid',
        canRunLargeLocalModel: true,
        canRunSmallLocalModel: true,
        canRunOnnx: true,
      },
    });

    await orchestrator.initialize();
    const mode = await orchestrator.effectiveMode();
    expect(['hybrid', 'local', 'cloud', 'eco']).toContain(mode);
  });

  it('sanitizes requests before dispatch', async () => {
    const registry = new AIProviderRegistry();
    const generate = vi.fn().mockResolvedValue({
      text: 'sanitized',
      meta: { provider: 'openai', model: 'test', mode: 'cloud', local: false, latencyMs: 1 },
    });
    registry.register({
      provider: 'openai',
      local: false,
      isAvailable: async () => true,
      generate,
    } as unknown as AIEngine);

    const keyStore = new MemoryVaultKeyStore();
    await keyStore.set('openai', { apiKey: 'sk-test', model: 'test', baseUrl: '' });

    const orchestrator = new UnifiedAIOrchestrator({
      preferences: { ...DEFAULT_PREFERENCES, mode: 'cloud' },
      registry,
      keyStore,
    });

    await orchestrator.ask({ task: 'user@example.com' });
    const dispatched = generate.mock.calls[0]?.[0] as AIRequest | undefined;
    expect(dispatched?.task).toContain('[REDACTED_EMAIL]');
  });
});
