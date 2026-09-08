/** Data quality status row for the Analytics efficiency section. */
export const DataQualityRow = ({
  label,
  value,
  desc,
  status,
}: {
  label: string;
  value: number;
  desc: string;
  status: 'ok' | 'warn';
}) => (
  <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs ${
        status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
      }`}
    >
      {value.toFixed(0)}%
    </span>
    <div className="flex-1">
      <p className="font-medium text-(--color-text) text-xs">{label}</p>
      <p className="text-(--color-muted) text-[10px]">{desc}</p>
    </div>
    <span
      className={`h-2 w-2 rounded-full ${
        status === 'ok' ? 'bg-emerald-400' : 'energy-pulse bg-yellow-400'
      }`}
    />
  </div>
);
