/**
 * No-op local engine used as a deterministic placeholder when no local model is loaded.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';

export class NoopLocalEngine implements AIEngine {
  readonly provider = 'local' as const;
  readonly local = true;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async generate(_request: AIRequest, _key: AIProviderKey): Promise<AIResponse> {
    throw new Error('No local engine configured. Load a model in Phase 2.');
  }
}
