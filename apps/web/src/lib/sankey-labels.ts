import type { TFunction } from 'i18next';
import type { SankeyNodeId } from '../workers/worker-types';

export function sankeyNodeLabel(t: TFunction<'translation'>, id: SankeyNodeId): string {
  return t(`sankey.node.${id}`);
}

export function sankeyLinkTooltip(
  t: TFunction<'translation'>,
  sourceId: SankeyNodeId,
  targetId: SankeyNodeId,
  watts: number,
): string {
  return t('sankey.linkTooltip', {
    source: sankeyNodeLabel(t, sourceId),
    target: sankeyNodeLabel(t, targetId),
    power: Math.round(watts),
  });
}

export function sankeyNodeTooltip(
  t: TFunction<'translation'>,
  id: SankeyNodeId,
  watts: number,
): string {
  return t('sankey.nodeTooltip', {
    name: sankeyNodeLabel(t, id),
    power: Math.round(watts),
  });
}

export function sankeyNodeDisplay(
  t: TFunction<'translation'>,
  id: SankeyNodeId,
  watts: number,
  compact: boolean,
): string {
  const name = sankeyNodeLabel(t, id);
  if (compact) return name;
  return t('sankey.nodeWithPower', { name, power: Math.round(watts) });
}
