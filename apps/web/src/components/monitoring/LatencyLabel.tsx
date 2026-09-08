export function LatencyLabel({ latencyMs }: { latencyMs: number }) {
  if (latencyMs <= 0) return null;
  return (
    <span className="font-mono text-(--color-muted) text-[10px]">{latencyMs.toFixed(0)}ms</span>
  );
}
