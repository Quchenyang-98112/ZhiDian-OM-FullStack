export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-(--color-muted)">{label}</span>
      <span className="font-medium font-mono text-(--color-text)">{value}</span>
    </div>
  );
}
