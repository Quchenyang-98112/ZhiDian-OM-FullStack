/**
 * worker-types.ts — Shared type definitions for Web Workers.
 *
 * Centralizes interfaces used by both worker threads and the main thread.
 * Worker files MUST NOT import from ../types.ts (which pulls in design-tokens
 * and other DOM-dependent modules). Instead, duplicate the minimal subset here.
 */

// ─── Energy Data (subset for workers) ────────────────────────────────

export interface EnergyDataInput {
  pvPower: number;
  batteryPower: number;
  houseLoad: number;
  heatPumpPower: number;
  evPower: number;
  gridPower: number;
}

export interface EnergyDataFull extends EnergyDataInput {
  gridVoltage: number;
  batteryVoltage: number;
  batterySoC: number;
  pvYieldToday: number;
  priceCurrent: number;
}

// ─── Sankey Worker ───────────────────────────────────────────────────

export type SankeyNodeId = 'pv' | 'grid' | 'battery' | 'house' | 'heatPump' | 'ev';

export interface SankeyWorkerInput {
  data: EnergyDataInput;
  width: number;
  height: number;
}

export interface SankeyGraphNode {
  id: SankeyNodeId;
  color: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  value: number;
}

export interface SankeyGraphLink {
  sourceIndex: number;
  targetIndex: number;
  sourceId: SankeyNodeId;
  targetId: SankeyNodeId;
  sourceColor: string;
  targetColor: string;
  value: number;
  width: number;
  y0: number;
  y1: number;
  sourceX1: number;
  targetX0: number;
}

export interface SankeyGraphResult {
  nodes: SankeyGraphNode[];
  links: SankeyGraphLink[];
}

// ─── AI Worker ───────────────────────────────────────────────────────

export interface OptimizerSettings {
  chargeThreshold: number;
  maxGridImportKw: number;
}

export interface OptimizerRecommendation {
  id: string;
  severity: 'positive' | 'warning' | 'critical' | 'neutral';
  titleKey: string;
  descriptionKey: string;
  value: string;
}

export interface PricePoint {
  timestamp: number; // Unix ms — Date not transferable
  price: number;
}

export interface ForecastSummary {
  min: number;
  max: number;
  avg: number;
  trend: 'rising' | 'falling' | 'stable';
}

export interface PredictiveInput {
  energyData: EnergyDataFull;
  forecast: Array<{
    timestamp: number; // Unix ms
    pricePerKwh: number;
    renewable: number;
    co2Intensity: number;
  }>;
  chargeThreshold: number;
}

export interface PredictiveResult {
  action: 'charge_ev' | 'charge_battery' | 'preheat' | 'wait';
  confidence: number;
  reasoning: string;
  optimalTimeSlot: {
    start: number; // Unix ms
    end: number;
    expectedPrice: number;
  };
  estimatedSavings: number;
}

// ─── Comlink-exposed API surfaces ────────────────────────────────────

export interface SankeyWorkerAPI {
  computeSankeyGraph(input: SankeyWorkerInput): SankeyGraphResult | null;
}

export interface AIWorkerAPI {
  computeRecommendations(
    energyData: EnergyDataFull,
    settings: OptimizerSettings,
  ): OptimizerRecommendation[];

  computePriceHistory(hours: number): PricePoint[];

  computeForecast(prices: PricePoint[]): ForecastSummary;

  computePredictive(input: PredictiveInput): PredictiveResult;
}

// ─── LLM Worker ──────────────────────────────────────────────────────

export interface LLMWorkerRequest {
  task: string;
  systemPrompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  /** Prefer a specific local provider; undefined lets the worker decide. */
  provider?: 'webllm' | 'transformers' | 'onnx' | 'heuristic';
}

export interface LLMWorkerResponse {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface LLMWorkerAPI {
  generate(request: LLMWorkerRequest): Promise<LLMWorkerResponse>;
}
