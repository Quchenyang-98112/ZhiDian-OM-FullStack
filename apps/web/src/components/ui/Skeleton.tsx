interface SkeletonProps {
  className?: string;
}

/** Single shimmer bar — compose these to build content placeholders */
export function SkeletonBar({ className = '' }: SkeletonProps) {
  return <div className={`skeleton h-4 rounded-lg ${className}`} />;
}

/** Card-shaped skeleton: header bar + N body lines */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass-panel p-5" aria-hidden="true">
      <SkeletonBar className="mb-4 h-5 w-2/5" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reordered
          <SkeletonBar key={i} className={i === lines - 1 ? 'w-3/5' : 'w-full'} />
        ))}
      </div>
    </div>
  );
}

/** Tab-level loading skeleton — replaces per-file TabFallback spinners */
export function TabSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Laden…"
      aria-busy="true"
    >
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={5} />
    </div>
  );
}

/** Page-level loading skeleton — shown during lazy route loads */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="页面加载中…" aria-busy="true">
      {/* Page header — include a real h1 so E2E smoke checks and a11y tests
          have a landmark to wait for even while chunks are loading. */}
      <h1 className="sr-only">{typeof document !== 'undefined' ? document.title : 'Nexus HEMS'}</h1>
      <div aria-hidden="true">
        <SkeletonBar className="mb-2 h-7 w-48" />
        <SkeletonBar className="h-4 w-72" />
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reordered
          <div key={i} className="glass-panel p-4">
            <SkeletonBar className="mb-3 h-4 w-3/4" />
            <SkeletonBar className="h-7 w-1/2" />
          </div>
        ))}
      </div>
      {/* Content cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
