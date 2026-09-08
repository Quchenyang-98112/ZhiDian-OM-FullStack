/**
 * Unified AI orchestrator.
 *
 * This is the single entry point for all AI requests in the HEMS dashboard.
 * It resolves the execution mode, selects a provider chain, applies the
 * safety layer, and dispatches to the chosen engine.
 */

import { detectCapabilities } from './capabilities.ts';
import { buildStrategy, resolveEffectiveMode } from './modes.ts';
import type { AIProviderRegistry } from './providers/registry.ts';
import { buildSafetySystemPrompt, sanitizeRequest } from './safety/prompt-sanitizer.ts';
import type {
  AICapabilityReport,
  AIEngine,
  AIExecutionMode,
  AIProvider,
  AIRequest,
  AIResponse,
  AIStrategy,
  StructuredOutputParser,
} from './types.ts';
import type { VaultKeyStore } from './vault/key-store.ts';

export interface OrchestratorPreferences {
  mode: AIExecutionMode;
  preferredCloudProvider?: AIProvider;
  allowCloudFallback: boolean;
  allowLocalExecution: boolean;
  timeoutMs: number;
}

export const DEFAULT_PREFERENCES: OrchestratorPreferences = {
  mode: 'hybrid',
  allowCloudFallback: true,
  allowLocalExecution: true,
  timeoutMs: 60_000,
};

export interface OrchestratorConfig {
  preferences: OrchestratorPreferences;
  registry: AIProviderRegistry;
  keyStore: VaultKeyStore;
  capabilities?: AICapabilityReport;
}

export class UnifiedAIOrchestrator {
  private readonly preferences: OrchestratorPreferences;
  private readonly registry: AIProviderRegistry;
  private readonly keyStore: VaultKeyStore;
  private capabilities: AICapabilityReport | undefined;

  constructor(config: OrchestratorConfig) {
    this.preferences = { ...DEFAULT_PREFERENCES, ...config.preferences };
    this.registry = config.registry;
    this.keyStore = config.keyStore;
    this.capabilities = config.capabilities;
  }

  async initialize(): Promise<void> {
    if (!this.capabilities) {
      this.capabilities = await detectCapabilities();
    }
  }

  getCapabilities(): AICapabilityReport | undefined {
    return this.capabilities;
  }

  getPreferences(): OrchestratorPreferences {
    return { ...this.preferences };
  }

  /**
   * Build the execution strategy for the current request.
   */
  async buildStrategy(): Promise<AIStrategy> {
    const caps = this.capabilities ?? (await detectCapabilities());
    const cloudProviders = await this.keyStore.list();
    return buildStrategy(this.preferences.mode, caps, cloudProviders.length > 0);
  }

  /**
   * Resolve the effective execution mode considering availability.
   */
  async effectiveMode(): Promise<AIExecutionMode> {
    const caps = this.capabilities ?? (await detectCapabilities());
    const hasCloudKey = (await this.keyStore.list()).length > 0;
    return resolveEffectiveMode(this.preferences.mode, caps, hasCloudKey);
  }

  /**
   * Execute a request and return raw text.
   */
  async ask(request: AIRequest): Promise<AIResponse> {
    const { request: safeRequest, verdict } = sanitizeRequest(request);
    const strategy = await this.buildStrategy();

    for (const provider of strategy.fallbackChain) {
      const result = await this.tryProvider(provider, safeRequest, verdict.injectionSuspected);
      if (result) return result;
    }

    throw new Error('No AI provider available for the requested mode');
  }

  /**
   * Execute a request and parse the result as structured output.
   */
  async askStructured<T>(request: AIRequest, parser: StructuredOutputParser<T>): Promise<T> {
    const response = await this.ask({ ...request, outputFormat: 'json' });
    const parsed = parser(response.text);
    if (parsed === null) {
      throw new Error('AI response could not be parsed into the expected structure');
    }
    return parsed;
  }

  private async tryProvider(
    provider: AIProvider,
    request: AIRequest,
    injectionSuspected = false,
  ): Promise<AIResponse | null> {
    let engine: AIEngine;
    try {
      engine = this.registry.get(provider);
    } catch {
      return null;
    }

    if (!(await engine.isAvailable())) {
      return null;
    }

    const key = engine.local ? undefined : await this.keyStore.get(provider);
    if (!engine.local && !key) {
      return null;
    }

    const safeRequest: AIRequest = {
      ...request,
      systemPrompt: buildSafetySystemPrompt(request.systemPrompt, { injectionSuspected }),
    };

    try {
      return await engine.generate(safeRequest, key);
    } catch (error) {
      console.warn(`[AI] Provider ${provider} failed:`, error);
      return null;
    }
  }
}
