/**
 * sankey-worker.ts — Off-main-thread energy flow graph computation.
 *
 * Receives EnergyData, computes node/link distribution and runs the
 * d3-sankey layout algorithm, then returns the positioned graph
 * ready for DOM rendering on the main thread.
 *
 * Node labels are locale-neutral IDs — the UI translates them via i18n.
 *
 * Uses Comlink for type-safe RPC — no manual postMessage plumbing.
 */

import * as Comlink from 'comlink';
import { sankey as sankeyLayout } from 'd3-sankey';
import type {
  EnergyDataInput,
  SankeyGraphResult,
  SankeyNodeId,
  SankeyWorkerAPI,
  SankeyWorkerInput,
} from './worker-types';

// Re-export types for consumers that import from this file
export type { SankeyGraphResult, SankeyWorkerInput } from './worker-types';

interface SankeyNode {
  id: SankeyNodeId;
  color: string;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  value?: number;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
  width?: number;
  y0?: number;
  y1?: number;
  sourceNode?: SankeyNode;
  targetNode?: SankeyNode;
}

// ─── Core computation ────────────────────────────────────────────────

const NODES: Array<{ id: SankeyNodeId; color: string }> = [
  { id: 'pv', color: '#facc15' },
  { id: 'grid', color: '#ef4444' },
  { id: 'battery', color: '#10b981' },
  { id: 'house', color: '#3b82f6' },
  { id: 'heatPump', color: '#f97316' },
  { id: 'ev', color: '#8b5cf6' },
];

function computeEnergyFlow(
  data: EnergyDataInput,
): Array<{ source: number; target: number; value: number }> {
  const links: Array<{ source: number; target: number; value: number }> = [];

  let pvRemaining = Math.max(0, data.pvPower);
  let batteryDischarge = Math.max(0, data.batteryPower);
  const batteryCharge = Math.max(0, -data.batteryPower);

  // PV → House
  const pvToHouse = Math.min(pvRemaining, data.houseLoad);
  if (pvToHouse > 0) {
    links.push({ source: 0, target: 3, value: pvToHouse });
    pvRemaining -= pvToHouse;
  }

  // PV → Heat Pump
  const pvToHp = Math.min(pvRemaining, data.heatPumpPower);
  if (pvToHp > 0) {
    links.push({ source: 0, target: 4, value: pvToHp });
    pvRemaining -= pvToHp;
  }

  // PV → EV
  const pvToEv = Math.min(pvRemaining, data.evPower);
  if (pvToEv > 0) {
    links.push({ source: 0, target: 5, value: pvToEv });
    pvRemaining -= pvToEv;
  }

  // PV → Battery
  const pvToBat = Math.min(pvRemaining, batteryCharge);
  if (pvToBat > 0) {
    links.push({ source: 0, target: 2, value: pvToBat });
    pvRemaining -= pvToBat;
  }

  // PV → Grid (Export)
  if (pvRemaining > 0) {
    links.push({ source: 0, target: 1, value: pvRemaining });
  }

  // Battery → House
  const batToHouse = Math.min(batteryDischarge, data.houseLoad - pvToHouse);
  if (batToHouse > 0) {
    links.push({ source: 2, target: 3, value: batToHouse });
    batteryDischarge -= batToHouse;
  }

  // Grid → House
  const gridToHouse = Math.max(0, data.houseLoad - pvToHouse - batToHouse);
  if (gridToHouse > 0) {
    links.push({ source: 1, target: 3, value: gridToHouse });
  }

  // Grid → Heat Pump
  const gridToHp = Math.max(0, data.heatPumpPower - pvToHp);
  if (gridToHp > 0) {
    links.push({ source: 1, target: 4, value: gridToHp });
  }

  // Grid → EV
  const gridToEv = Math.max(0, data.evPower - pvToEv);
  if (gridToEv > 0) {
    links.push({ source: 1, target: 5, value: gridToEv });
  }

  // Grid → Battery
  const gridToBat = Math.max(0, batteryCharge - pvToBat);
  if (gridToBat > 0) {
    links.push({ source: 1, target: 2, value: gridToBat });
  }

  return links.filter((l) => l.value > 10);
}

function computeSankeyGraph(input: SankeyWorkerInput): SankeyGraphResult | null {
  const activeLinks = computeEnergyFlow(input.data);
  if (activeLinks.length === 0) return null;

  const isMobile = input.width < 640;
  const nodeWidth = isMobile ? 10 : 15;
  const nodePadding = isMobile ? 15 : 20;
  const padding = isMobile ? 5 : 10;

  const generator = sankeyLayout<SankeyNode, SankeyLink>()
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .extent([
      [padding, padding],
      [input.width - padding, input.height - padding],
    ]);

  const graph = generator({
    nodes: NODES.map((d) => ({ ...d })),
    links: activeLinks.map((d) => ({ ...d })),
  });

  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      color: n.color,
      x0: n.x0 ?? 0,
      y0: n.y0 ?? 0,
      x1: n.x1 ?? 0,
      y1: n.y1 ?? 0,
      value: n.value ?? 0,
    })),
    links: graph.links.map((l) => {
      const src = l.source as SankeyNode;
      const tgt = l.target as SankeyNode;
      return {
        sourceIndex: NODES.findIndex((n) => n.id === src.id),
        targetIndex: NODES.findIndex((n) => n.id === tgt.id),
        sourceId: src.id,
        targetId: tgt.id,
        sourceColor: src.color,
        targetColor: tgt.color,
        value: l.value,
        width: l.width ?? 0,
        y0: l.y0 ?? 0,
        y1: l.y1 ?? 0,
        sourceX1: src.x1 ?? 0,
        targetX0: tgt.x0 ?? 0,
      };
    }),
  };
}

// ─── Comlink-exposed API ─────────────────────────────────────────────

const api: SankeyWorkerAPI = {
  computeSankeyGraph,
};

Comlink.expose(api);
