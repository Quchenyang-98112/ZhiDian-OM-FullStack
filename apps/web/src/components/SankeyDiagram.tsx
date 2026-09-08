import * as Comlink from 'comlink';
import { sankeyLinkHorizontal } from 'd3-sankey';
import { select } from 'd3-selection';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { persistSankeySnapshot } from '../lib/db';
import {
  sankeyLinkTooltip,
  sankeyNodeDisplay,
  sankeyNodeLabel,
  sankeyNodeTooltip,
} from '../lib/sankey-labels';
import type { EnergyData } from '../types';
import type {
  SankeyGraphResult,
  SankeyWorkerAPI,
  SankeyWorkerInput,
} from '../workers/worker-types';

/**
 * Builds a concise screen-reader announcement string for the current energy state.
 * Debounced externally — only called when the live region should update.
 */
function buildAnnouncement(data: EnergyData, t: TFunction<'translation'>): string {
  const parts: string[] = [];
  if (data.pvPower > 0)
    parts.push(t('accessibility.sankeyAnnouncePV', { power: Math.round(data.pvPower) }));
  if (data.gridPower > 0)
    parts.push(t('accessibility.sankeyAnnounceGridImport', { power: Math.round(data.gridPower) }));
  if (data.gridPower < 0)
    parts.push(
      t('accessibility.sankeyAnnounceGridExport', { power: Math.abs(Math.round(data.gridPower)) }),
    );
  if (data.batteryPower > 0)
    parts.push(
      t('accessibility.sankeyAnnounceBatteryDischarge', { power: Math.round(data.batteryPower) }),
    );
  if (data.batteryPower < 0)
    parts.push(
      t('accessibility.sankeyAnnounceBatteryCharge', {
        power: Math.abs(Math.round(data.batteryPower)),
      }),
    );
  parts.push(t('accessibility.sankeyAnnounceLoad', { power: Math.round(data.houseLoad) }));
  return parts.join('. ');
}

export function SankeyDiagram({ data }: { data: EnergyData }) {
  const { t, i18n } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const workerRef = useRef<Comlink.Remote<SankeyWorkerAPI> | null>(null);
  const rawWorkerRef = useRef<Worker | null>(null);
  const [graph, setGraph] = useState<SankeyGraphResult | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced ARIA-live announcements (every 5s max to avoid screen-reader spam)
  useEffect(() => {
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    announceTimerRef.current = setTimeout(() => {
      setLiveAnnouncement(buildAnnouncement(data, t));
    }, 5000);
    return () => {
      if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    };
  }, [data, t]);

  // Initialise the Web Worker once via Comlink
  useEffect(() => {
    const w = new Worker(new URL('../workers/sankey-worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = Comlink.wrap<SankeyWorkerAPI>(w);
    rawWorkerRef.current = w;
    return () => {
      w.terminate();
      workerRef.current = null;
      rawWorkerRef.current = null;
    };
  }, []);

  // Send computation to worker whenever data changes
  useEffect(() => {
    if (!workerRef.current || !svgRef.current) return;
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    if (width === 0 || height === 0) return;

    const msg: SankeyWorkerInput = {
      data: {
        pvPower: data.pvPower,
        batteryPower: data.batteryPower,
        houseLoad: data.houseLoad,
        heatPumpPower: data.heatPumpPower,
        evPower: data.evPower,
        gridPower: data.gridPower,
      },
      width,
      height,
    };

    let cancelled = false;
    workerRef.current.computeSankeyGraph(msg).then((result) => {
      if (!cancelled) setGraph(result);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // D3 DOM rendering on main thread — only when graph result arrives
  useEffect(() => {
    if (!svgRef.current || !graph) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const isMobile = width < 640;
    const nodeWidth = isMobile ? 10 : 15;
    const fontSize = isMobile ? '10px' : '12px';

    // Clear previous
    select(svgRef.current).selectAll('*').remove();

    const svg = select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Define gradient defs for links
    const defs = svg.append('defs');

    graph.links.forEach((link, i) => {
      const gradient = defs
        .append('linearGradient')
        .attr('id', `link-gradient-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse');
      gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', link.sourceColor)
        .attr('stop-opacity', 0.6);
      gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', link.targetColor)
        .attr('stop-opacity', 0.4);
    });

    // Draw links — reconstruct d3-sankey-compatible link objects for sankeyLinkHorizontal
    const pathGen = sankeyLinkHorizontal();
    svg
      .append('g')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', (d) =>
        pathGen({
          source: { x1: d.sourceX1, y0: d.y0, y1: d.y0 } as never,
          target: { x0: d.targetX0, y0: d.y1, y1: d.y1 } as never,
          width: d.width,
          y0: d.y0,
          y1: d.y1,
        } as never),
      )
      .attr('fill', 'none')
      .attr('stroke', (_d, i) => `url(#link-gradient-${i})`)
      .attr('stroke-width', (d) => Math.max(1, d.width))
      .attr('stroke-opacity', 0.5)
      .attr('class', 'energy-flow-path')
      .style('filter', (d) => `drop-shadow(0 0 4px ${d.sourceColor}50)`)
      .style('cursor', 'pointer')
      .style('transition', 'all 0.3s ease-out')
      .on('mouseenter', function (_event, d) {
        select(this)
          .attr('stroke-opacity', 0.75)
          .attr('stroke-width', Math.max(2, d.width + 2))
          .style('filter', `drop-shadow(0 0 8px ${d.sourceColor}70)`);
      })
      .on('mouseleave', function (_event, d) {
        select(this)
          .attr('stroke-opacity', 0.5)
          .attr('stroke-width', Math.max(1, d.width))
          .style('filter', `drop-shadow(0 0 4px ${d.sourceColor}50)`);
      })
      .append('title')
      .text((d) => sankeyLinkTooltip(t, d.sourceId, d.targetId, d.value));

    // Draw nodes
    const node = svg
      .append('g')
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'pointer');

    node
      .append('rect')
      .attr('height', (d) => d.y1 - d.y0)
      .attr('width', (d) => d.x1 - d.x0)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', 0.9)
      .attr('rx', 6)
      .attr('ry', 6)
      .style('filter', (d) => `drop-shadow(0 2px 4px ${d.color}30)`)
      .style('transition', 'all 0.2s ease-out')
      .on('mouseenter', function (_event, d) {
        select(this)
          .attr('fill-opacity', 1)
          .style('filter', `drop-shadow(0 4px 12px ${d.color}60)`);
      })
      .on('mouseleave', function (_event, d) {
        select(this)
          .attr('fill-opacity', 0.9)
          .style('filter', `drop-shadow(0 2px 4px ${d.color}30)`);
      })
      .append('title')
      .text((d) => sankeyNodeTooltip(t, d.id, d.value));

    node
      .append('text')
      .attr('x', (d) => (d.x0 < width / 2 ? nodeWidth + 5 : -5))
      .attr('y', (d) => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x0 < width / 2 ? 'start' : 'end'))
      .text((d) => sankeyNodeDisplay(t, d.id, d.value, isMobile))
      .attr('fill', 'var(--color-text)')
      .attr('font-size', fontSize)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', '500')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Cache Sankey data for offline mode
    void persistSankeySnapshot(
      data,
      graph.links.map((l) => ({
        source: l.sourceId,
        target: l.targetId,
        value: l.value,
      })),
    );
  }, [graph, data, t, i18n.language]);

  return (
    <>
      {/* Screen-reader live region for energy flow changes */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement}
      </div>
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={t('sankey.ariaLabel')}
      >
        <title>{t('sankey.title')}</title>
        <desc>
          {t('sankey.desc', {
            pvPower: Math.round(data.pvPower),
            batterySoC: data.batterySoC.toFixed(1),
            houseLoad: Math.round(data.houseLoad),
            gridDirection: data.gridPower > 0 ? t('sankey.importing') : t('sankey.exporting'),
            gridPower: Math.abs(Math.round(data.gridPower)),
          })}
        </desc>
      </svg>
      {/* Accessible data table for screen readers */}
      <table className="sr-only" aria-label={t('accessibility.sankeyDataTable')}>
        <thead>
          <tr>
            <th scope="col">{t('accessibility.sankeySource')}</th>
            <th scope="col">{t('accessibility.sankeyTarget')}</th>
            <th scope="col">{t('accessibility.sankeyPower')}</th>
          </tr>
        </thead>
        <tbody>
          {graph?.links.map((link) => (
            <tr
              key={`${link.sourceId}-${link.targetId}-${link.value}`}
              data-sankey-source={link.sourceId}
              data-sankey-target={link.targetId}
            >
              <td>{sankeyNodeLabel(t, link.sourceId)}</td>
              <td>{sankeyNodeLabel(t, link.targetId)}</td>
              <td>{Math.round(link.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
