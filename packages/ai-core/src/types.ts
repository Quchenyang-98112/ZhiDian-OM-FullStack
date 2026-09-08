/**
 * Core AI types shared across providers, orchestrator, safety, and consumers.
 */

import type { z } from 'zod';

/** Supported cloud/local AI provider identifiers. */
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'groq'
  | 'ollama'
  | 'custom'
  | 'webllm'
  | 'transformers'
  | 'onnx'
  | 'heuristic'
  | 'local';

/** Execution mode for the orchestrator. */
export type AIExecutionMode = 'hybrid' | 'local' | 'cloud' | 'eco';

/** Capabilities detected at runtime. */
export interface AICapabilityReport {
  webgpu: boolean;
  webgl: boolean;
  webAssembly: boolean;
  simd: boolean;
  threads: boolean;
  hardwareConcurrency: number;
  deviceMemoryGb: number | undefined;
  estimatedGpuMemoryMb: number | undefined;
  indexedDb: boolean;
  localStorage: boolean;
  recommendedMode: AIExecutionMode;
  canRunLargeLocalModel: boolean;
  canRunSmallLocalModel: boolean;
  canRunOnnx: boolean;
}

/** A single message in a chat-style prompt. */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Structured request to the AI orchestrator. */
export interface AIRequest {
  /** Human-facing task description. */
  task: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** Optional conversation context. */
  messages?: AIMessage[];
  /** Structured context data (will be sanitized). */
  context?: Record<string, unknown>;
  /** Desired response format. */
  outputFormat?: 'text' | 'json';
  temperature?: number;
  maxTokens?: number;
  /** Optional timeout in ms per execution layer. */
  timeoutMs?: number;
}

/** Provider metadata returned with every response. */
export interface AIResponseMeta {
  provider: AIProvider;
  model: string;
  mode: AIExecutionMode;
  local: boolean;
  latencyMs: number;
}

/** Result of an orchestrated AI request. */
export interface AIResponse {
  text: string;
  meta: AIResponseMeta;
}

/** Typed structured result. */
export interface AIStructuredResponse<T> {
  data: T;
  meta: AIResponseMeta;
}

/** Provider-specific configuration. */
export interface AIProviderConfig {
  provider: AIProvider;
  label: string;
  baseUrl: string;
  models: string[];
  local: boolean;
}

/** Key material retrieved from the vault. */
export interface AIProviderKey {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** Strategy decision produced by the mode selector. */
export interface AIStrategy {
  mode: AIExecutionMode;
  fallbackChain: AIProvider[];
}

/** Provider interface implemented by every engine. */
export interface AIEngine {
  readonly provider: AIProvider;
  readonly local: boolean;
  isAvailable(): Promise<boolean>;
  generate(request: AIRequest, key?: AIProviderKey): Promise<AIResponse>;
}

/** Structured output parser signature. */
export type StructuredOutputParser<T> = (text: string) => T | null;

/** Zod-based validator helper. */
export function createZodParser<T>(schema: z.ZodType<T>): StructuredOutputParser<T> {
  return (text: string): T | null => {
    const jsonMatch =
      text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    const jsonText = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : text;
    try {
      const parsed = JSON.parse(jsonText);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      console.warn('[AI] Structured output validation failed:', result.error.issues.slice(0, 3));
      return null;
    } catch {
      return null;
    }
  };
}
