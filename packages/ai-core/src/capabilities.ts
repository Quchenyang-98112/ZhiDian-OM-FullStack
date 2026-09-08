/**
 * Runtime capability assessment for local AI execution.
 * Detects WebGPU, WebAssembly features, memory, and storage availability.
 */

import type { AICapabilityReport, AIExecutionMode } from './types.ts';

const LARGE_LOCAL_MODEL_MIN_MEMORY_GB = 4;
const SMALL_LOCAL_MODEL_MIN_MEMORY_GB = 2;

function detectWebGpu(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator && navigator.gpu != null;
}

function detectWebGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl') != null || canvas.getContext('experimental-webgl') != null;
  } catch {
    return false;
  }
}

function detectWasm(): { wasm: boolean; simd: boolean; threads: boolean } {
  if (typeof WebAssembly === 'undefined') {
    return { wasm: false, simd: false, threads: false };
  }

  const wasm = true;
  let simd = false;
  let threads = false;

  try {
    // SIMD test: minimal valid SIMD module (i32x4.splat)
    const simdBuffer = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00, 0x07, 0x0a, 0x01, 0x06, 0x61, 0x69, 0x2d, 0x73, 0x69, 0x6d, 0x64,
      0x00, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0x1a, 0x0b,
    ]);
    new WebAssembly.Module(simdBuffer);
    simd = true;
  } catch {
    // SIMD unsupported
  }

  try {
    // Threads test: check for SharedArrayBuffer + atomic instructions
    threads =
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined' &&
      Atomics.load != null;
  } catch {
    // Threads unsupported
  }

  return { wasm, simd, threads };
}

function estimateGpuMemoryMb(): number | undefined {
  const adapter = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } })
    .gpu;
  if (!adapter?.requestAdapter) return undefined;
  // Actual GPU memory detection is not exposed in browsers; return a conservative marker.
  return undefined;
}

function detectStorage(): { indexedDb: boolean; localStorage: boolean } {
  try {
    return {
      indexedDb: typeof indexedDB !== 'undefined',
      localStorage: typeof localStorage !== 'undefined' && localStorage != null,
    };
  } catch {
    return { indexedDb: false, localStorage: false };
  }
}

function recommendMode(report: AICapabilityReport): AIExecutionMode {
  if (!report.indexedDb) return 'cloud';
  if (report.canRunLargeLocalModel && report.webgpu) return 'hybrid';
  if (report.canRunSmallLocalModel) return 'hybrid';
  if (report.canRunOnnx) return 'eco';
  return 'cloud';
}

/**
 * Detect browser/device capabilities relevant to local AI execution.
 */
export async function detectCapabilities(): Promise<AICapabilityReport> {
  const webgpu = detectWebGpu();
  const webgl = detectWebGl();
  const { wasm: webAssembly, simd, threads } = detectWasm();
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 1;
  const deviceMemoryGb =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? Number(navigator.deviceMemory)
      : undefined;
  const estimatedGpuMemoryMb = estimateGpuMemoryMb();
  const { indexedDb, localStorage } = detectStorage();

  const memoryGb = deviceMemoryGb ?? 0;
  const canRunLargeLocalModel = webgpu && memoryGb >= LARGE_LOCAL_MODEL_MIN_MEMORY_GB;
  const canRunSmallLocalModel = webAssembly && memoryGb >= SMALL_LOCAL_MODEL_MIN_MEMORY_GB;
  const canRunOnnx = webAssembly;

  const report: AICapabilityReport = {
    webgpu,
    webgl,
    webAssembly,
    simd,
    threads,
    hardwareConcurrency,
    deviceMemoryGb: Number.isFinite(memoryGb) && memoryGb > 0 ? memoryGb : undefined,
    estimatedGpuMemoryMb,
    indexedDb,
    localStorage,
    canRunLargeLocalModel,
    canRunSmallLocalModel,
    canRunOnnx,
    recommendedMode: 'cloud',
  };

  report.recommendedMode = recommendMode(report);
  return report;
}
