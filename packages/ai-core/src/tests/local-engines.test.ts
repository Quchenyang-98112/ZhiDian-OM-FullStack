import { describe, expect, it } from 'vitest';
import { HeuristicEngine } from '../providers/local/heuristic-engine.ts';
import { OnnxEngine } from '../providers/local/onnx-engine.ts';
import { TransformersEngine } from '../providers/local/transformers-engine.ts';
import { WebLLMEngine } from '../providers/local/webllm-engine.ts';
import { AIProviderRegistry } from '../providers/registry.ts';

describe('HeuristicEngine', () => {
  it('matches battery keywords', async () => {
    const engine = new HeuristicEngine();
    const response = await engine.generate({ task: 'Should I charge the battery now?' });
    expect(response.text).toContain('SOC');
    expect(response.meta.local).toBe(true);
    expect(response.meta.provider).toBe('heuristic');
  });

  it('falls back to generic guidance', async () => {
    const engine = new HeuristicEngine();
    const response = await engine.generate({ task: 'What is the weather?' });
    expect(response.text).toContain('energy management');
  });
});

describe('OnnxEngine', () => {
  it('is unavailable by default (local-LLM engines deferred, F-03)', async () => {
    const engine = new OnnxEngine();
    expect(await engine.isAvailable()).toBe(false);
  });

  it('reports WebAssembly-based availability when the build flag is enabled', async () => {
    process.env.ENABLE_LOCAL_LLM = 'true';
    try {
      const engine = new OnnxEngine();
      expect(await engine.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    } finally {
      delete process.env.ENABLE_LOCAL_LLM;
    }
  });

  it('returns guidance when no model is configured', async () => {
    const engine = new OnnxEngine();
    const response = await engine.generate({ task: 'Optimize my home' });
    expect(response.text).toContain('no model is configured');
    expect(response.meta.provider).toBe('onnx');
  });
});

describe('TransformersEngine', () => {
  it('is unavailable by default (F-03)', async () => {
    const engine = new TransformersEngine();
    expect(await engine.isAvailable()).toBe(false);
  });

  it('is available with WebAssembly when the build flag is enabled', async () => {
    process.env.ENABLE_LOCAL_LLM = 'true';
    try {
      const engine = new TransformersEngine();
      expect(await engine.isAvailable()).toBe(typeof WebAssembly !== 'undefined');
    } finally {
      delete process.env.ENABLE_LOCAL_LLM;
    }
  });

  it('gracefully handles model load failure when opted in', async () => {
    process.env.ENABLE_LOCAL_LLM = 'true';
    try {
      const engine = new TransformersEngine({ model: 'nonexistent-model' });
      const response = await engine.generate({ task: 'hello' });
      expect(response.text).toContain('could not be loaded');
    } finally {
      delete process.env.ENABLE_LOCAL_LLM;
    }
  });
});

describe('WebLLMEngine', () => {
  it('is unavailable by default (F-03)', async () => {
    const engine = new WebLLMEngine();
    expect(await engine.isAvailable()).toBe(false);
  });

  it('is available only with WebGPU when the build flag is enabled', async () => {
    process.env.ENABLE_LOCAL_LLM = 'true';
    try {
      const engine = new WebLLMEngine();
      const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      expect(await engine.isAvailable()).toBe(hasWebGpu);
    } finally {
      delete process.env.ENABLE_LOCAL_LLM;
    }
  });

  it('gracefully handles model load failure when opted in', async () => {
    process.env.ENABLE_LOCAL_LLM = 'true';
    try {
      const engine = new WebLLMEngine({ model: 'nonexistent-model' });
      const response = await engine.generate({ task: 'hello' });
      expect(response.text).toContain('could not be loaded');
    } finally {
      delete process.env.ENABLE_LOCAL_LLM;
    }
  });
});

describe('AIProviderRegistry', () => {
  it('registers all local and cloud engines', () => {
    const registry = new AIProviderRegistry();
    const providers = registry.list();
    expect(providers).toContain('webllm');
    expect(providers).toContain('transformers');
    expect(providers).toContain('onnx');
    expect(providers).toContain('heuristic');
    expect(providers).toContain('openai');
  });

  it('retrieves a local engine by provider id', () => {
    const registry = new AIProviderRegistry();
    const engine = registry.get('heuristic');
    expect(engine.local).toBe(true);
    expect(engine.provider).toBe('heuristic');
  });
});
