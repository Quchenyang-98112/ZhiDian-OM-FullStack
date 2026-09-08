/** Recharts linear gradients for the energy balance area chart. */
export const EnergyBalanceChartGradients = () => (
  <defs>
    <linearGradient id="gradPv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="var(--chart-7)" stopOpacity={0.7} />
      <stop offset="95%" stopColor="var(--chart-7)" stopOpacity={0.05} />
    </linearGradient>
    <linearGradient id="gradCons" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.5} />
      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.05} />
    </linearGradient>
    <linearGradient id="gradSurplus" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.6} />
      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
    </linearGradient>
  </defs>
);
