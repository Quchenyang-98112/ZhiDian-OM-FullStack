/**
 * Central multi-provider AI client for HEMS optimization.
 *
 * This module is a thin wrapper around @nexus-hems/ai-core. It preserves the
 * existing component-facing API while delegating provider selection, safety,
 * fallback chains, and local inference to the shared orchestrator.
 *
 * API keys are always fetched from encrypted Dexie storage — never from env
 * vars or localStorage.
 */

import {
  type AIExecutionMode,
  type AIProvider,
  AIProviderRegistry,
  createZodParser,
  sanitizeRequest,
  UnifiedAIOrchestrator,
} from '@nexus-hems/ai-core';
import { sanitizeRenderedText, sanitizeUntrustedText } from '@nexus-hems/shared-types';
import { z } from 'zod';
import { DexieVaultKeyStore } from '../lib/ai-vault';

export interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionResult {
  text: string;
  provider: AIProvider;
  model: string;
}

const HEMS_SYSTEM_PROMPT = `You are an AI energy optimization expert for a Home Energy Management System (HEMS).
Analyze real-time energy data and provide actionable optimization recommendations.
Focus on: cost minimization, self-consumption maximization, CO₂ reduction, battery optimization, smart EV charging.
Always respond with valid JSON arrays when structured output is requested.`;

const AI_SYSTEM_PROMPT_MAX_LENGTH = 2_000;
const AI_USER_PROMPT_MAX_LENGTH = 8_000;

// ─── MED-06: Zod schemas for structured AI response validation ───────

export const OptimizationSuggestionSchema = z.object({
  hour: z.number().int().min(0).max(23),
  batteryKw: z.number().optional(),
  gridKw: z.number().optional(),
  pvKw: z.number().optional(),
  reason: z.string().optional(),
});

export const OptimizationResponseSchema = z.object({
  suggestions: z.array(OptimizationSuggestionSchema),
  estimatedSavings: z.number().optional(),
  currency: z.string().length(3).optional(),
});

export const ForecastResponseSchema = z.object({
  pvForecast: z.array(z.number()).length(24),
  loadForecast: z.array(z.number()).length(24),
  priceSignal: z.array(z.number()).length(24).optional(),
});

export type OptimizationResponse = z.infer<typeof OptimizationResponseSchema>;
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

/**
 * Attempt to parse a filtered AI output string as a structured response.
 * Returns the parsed object on success, or null on failure (graceful degradation).
 */
export function parseAIStructuredOutput<T>(text: string, schema: z.ZodType<T>): T | null {
  const parser = createZodParser(schema);
  return parser(text) as T | null;
}

// ─── MED-09: Prompt Injection Sanitization + PII Masking (ADR-008) ──

export function sanitizeForPrompt(value: string, maxLength = 64): string {
  return sanitizeUntrustedText(value, maxLength);
}

export function filterAIOutput(output: string): string {
  return sanitizeRenderedText(output, AI_USER_PROMPT_MAX_LENGTH);
}

const registry = new AIProviderRegistry();
const keyStore = new DexieVaultKeyStore();

let cachedOrchestrator: UnifiedAIOrchestrator | undefined;

async function getOrchestrator(): Promise<UnifiedAIOrchestrator> {
  if (!cachedOrchestrator) {
    cachedOrchestrator = new UnifiedAIOrchestrator({
      preferences: {
        mode: getAIMode(),
        allowCloudFallback: true,
        allowLocalExecution: true,
        timeoutMs: 120_000,
      },
      registry,
      keyStore,
    });
    await cachedOrchestrator.initialize();
  }
  return cachedOrchestrator;
}

export function getAIMode(): AIExecutionMode {
  const stored = localStorage.getItem('nexus-hems-ai-mode');
  if (stored && ['hybrid', 'local', 'cloud', 'eco'].includes(stored)) {
    return stored as AIExecutionMode;
  }
  // Privacy-first default: deterministic local heuristics, no network, no model
  // download. Users opt into local ML models ('local') or cloud ('hybrid'/'cloud').
  return 'eco';
}

export function setAIMode(mode: AIExecutionMode): void {
  localStorage.setItem('nexus-hems-ai-mode', mode);
  cachedOrchestrator = undefined;
}

const LOCAL_MODEL_PREFERENCE_KEY = 'nexus-hems-ai-local-model';

export function getPreferredLocalModel(): AIProvider {
  const stored = localStorage.getItem(LOCAL_MODEL_PREFERENCE_KEY);
  return (stored as AIProvider) ?? 'heuristic';
}

export function setPreferredLocalModel(model: AIProvider): void {
  localStorage.setItem(LOCAL_MODEL_PREFERENCE_KEY, model);
}

/**
 * Calls the configured AI provider with the given prompt.
 */
export async function callAI(request: AICompletionRequest): Promise<AICompletionResult> {
  const orchestrator = await getOrchestrator();
  const systemPrompt = sanitizeForPrompt(
    request.systemPrompt ?? HEMS_SYSTEM_PROMPT,
    AI_SYSTEM_PROMPT_MAX_LENGTH,
  );
  const userPrompt = sanitizeForPrompt(request.prompt, AI_USER_PROMPT_MAX_LENGTH);

  const { request: safeRequest } = sanitizeRequest({
    task: userPrompt,
    systemPrompt,
    temperature: request.temperature ?? 0.7,
    maxTokens: request.maxTokens ?? 1024,
  });

  const response = await orchestrator.ask(safeRequest);

  return {
    text: filterAIOutput(response.text),
    provider: response.meta.provider,
    model: response.meta.model,
  };
}

/**
 * Calls the AI and parses the response as a structured object.
 */
export async function callAIStructured<T>(
  request: AICompletionRequest,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const result = await callAI({
    ...request,
    systemPrompt: `${request.systemPrompt ?? HEMS_SYSTEM_PROMPT}\nRespond with valid JSON only.`,
  });
  return parseAIStructuredOutput(result.text, schema);
}
