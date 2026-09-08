import { Activity, Leaf, Radio } from 'lucide-react';

/** Props for {@link AppShellHeaderTicker}. */
export interface AppShellHeaderTickerProps {
  /** Current electricity price in €/kWh. */
  priceCurrent: number;
  /** PV production in watts. */
  pvPower: number;
  /** Battery state of charge (0–100). */
  batterySoC: number;
  /** Grid power in watts (positive = import, negative = export). */
  gridPower: number;
  /** Self-sufficiency ratio in the range 0–100. */
  selfSufficiencyPercent: number;
}

/**
 * Mobile/tablet live KPI ticker below the main header row.
 */
export function AppShellHeaderTicker(_props: AppShellHeaderTickerProps) {
  return (
    <div
      className="scrollbar-hide mt-1.5 flex items-center gap-2 overflow-x-auto lg:hidden"
      role="status"
      aria-label="电厂实时状态"
      aria-live="polite"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-strong) px-2.5 py-1 text-(--color-muted) text-[10px]">
        <Radio size={12} className="text-(--color-primary)" />
        实时监测
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-strong) px-2.5 py-1 text-(--color-muted) text-[10px]">
        <Activity size={12} className="text-(--color-primary)" />
        总出力 860 MW
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-strong) px-2.5 py-1 text-(--color-muted) text-[10px]">
        <Leaf size={12} className="text-emerald-300" />
        新能源消纳 93.8%
      </span>
    </div>
  );
}
