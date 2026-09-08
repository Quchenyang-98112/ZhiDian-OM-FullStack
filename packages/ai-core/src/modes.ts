/**
 * Execution-mode selector for the AI orchestrator.
 * Maps user preference + device capabilities to an ordered fallback chain.
 */

import type { AICapabilityReport, AIExecutionMode, AIProvider, AIStrategy } from './types.ts';

const CLOUD_CHAIN: AIProvider[] = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'groq',
  'ollama',
  'custom',
];

function capabilitiesToLocalChain(capabilities: AICapabilityReport): AIProvider[] {
  const chain: AIProvider[] = [];
  if (capabilities.canRunLargeLocalModel) chain.push('webllm');
  if (capabilities.canRunSmallLocalModel) chain.push('transformers');
  if (capabilities.canRunOnnx) chain.push('onnx');
  chain.push('heuristic');
  return chain.length > 0 ? chain : ['heuristic'];
}

/**
 * Build the execution strategy for a request.
 *
 * @param requestedMode   Mode from user settings; 'hybrid' means "choose best".
 * @param capabilities    Device capability report.
 * @param hasCloudKey     Whether at least one cloud provider key is configured.
 */
export function buildStrategy(
  requestedMode: AIExecutionMode,
  capabilities: AICapabilityReport,
  hasCloudKey: boolean,
): AIStrategy {
  const localChain = capabilitiesToLocalChain(capabilities);

  switch (requestedMode) {
    case 'local':
      return { mode: 'local', fallbackChain: localChain };

    case 'cloud':
      return { mode: 'cloud', fallbackChain: hasCloudKey ? CLOUD_CHAIN : [] };

    case 'eco':
      // Eco prefers deterministic heuristics, then tiny local models, never cloud unless explicit.
      return {
        mode: 'eco',
        fallbackChain: ['heuristic', ...(capabilities.canRunOnnx ? ['onnx'] : []), 'transformers'],
      } as AIStrategy;
    default: {
      const chain: AIProvider[] = [...localChain];
      if (hasCloudKey) chain.push(...CLOUD_CHAIN);
      return { mode: 'hybrid', fallbackChain: chain };
    }
  }
}

/**
 * Resolve the effective mode given capabilities and availability.
 * Falls back to 'cloud' when local execution is impossible and a key exists,
 * or 'heuristic' as the ultimate fallback.
 */
export function resolveEffectiveMode(
  requestedMode: AIExecutionMode,
  capabilities: AICapabilityReport,
  hasCloudKey: boolean,
): AIExecutionMode {
  if (requestedMode === 'cloud') return hasCloudKey ? 'cloud' : 'eco';
  if (requestedMode === 'local') return capabilities.canRunSmallLocalModel ? 'local' : 'cloud';
  if (requestedMode === 'eco') return 'eco';
  return capabilities.recommendedMode;
}
