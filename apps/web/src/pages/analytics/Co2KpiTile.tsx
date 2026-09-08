/** Single KPI tile in the CO₂ report grid. */
export const Co2KpiTile = ({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number;
  label: string;
  color: string;
}) => (
  <div className="rounded-xl bg-white/5 p-3 text-center">
    <span className="text-lg">{icon}</span>
    <p className={`fluid-text-lg font-bold ${color}`}>{Math.abs(value).toFixed(1)} kg</p>
    <p className="text-(--color-muted) text-[10px]">{label}</p>
  </div>
);
