import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { EventLogEntry } from './types';
import { VirtualEventRow } from './VirtualEventRow';

// skipcq: JS-R1005
export function VirtualEventLog({ events }: { events: EventLogEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 3,
  });

  return (
    <div ref={parentRef} className="max-h-[280px] overflow-y-auto" role="log" aria-live="polite">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <VirtualEventRow event={events[virtualRow.index] as EventLogEntry} />
          </div>
        ))}
      </div>
    </div>
  );
}
