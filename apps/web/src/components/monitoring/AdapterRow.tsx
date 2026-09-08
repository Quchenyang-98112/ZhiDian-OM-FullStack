import { Wifi, WifiOff } from 'lucide-react';
import { ContribBadge } from './ContribBadge';
import { LatencyLabel } from './LatencyLabel';
import type { AdapterItem } from './types';

function adapterIconBackground(isConnected: boolean, contrib?: boolean | undefined): string {
  if (isConnected) return 'bg-emerald-500/15 text-emerald-400';
  if (contrib) return 'bg-white/5 text-(--color-muted)';
  return 'bg-red-500/15 text-red-400';
}

function AdapterStatusIcon({
  isConnected,
  contrib,
}: {
  isConnected: boolean;
  contrib?: boolean | undefined;
}) {
  if (isConnected) {
    return <Wifi size={14} className="text-emerald-400" aria-hidden="true" />;
  }
  return (
    <WifiOff
      size={14}
      className={contrib ? 'text-(--color-muted)' : 'text-red-400'}
      aria-hidden="true"
    />
  );
}

// skipcq: JS-R1005
export function AdapterRow({
  adapter,
  isConnected,
  latencyMs,
  contrib,
}: {
  adapter: AdapterItem;
  isConnected: boolean;
  latencyMs: number;
  contrib?: boolean;
}) {
  const iconBg = adapterIconBackground(isConnected, contrib);

  return (
    <div className="group flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
        {adapter.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-(--color-text) text-sm">{adapter.name}</span>
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-(--color-muted) text-[9px]">
            {adapter.protocol}
          </span>
          <ContribBadge contrib={contrib} />
        </div>
        <p className="truncate text-(--color-muted) text-[10px]">{adapter.desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LatencyLabel latencyMs={latencyMs} />
        <AdapterStatusIcon isConnected={isConnected} contrib={contrib} />
      </div>
    </div>
  );
}
