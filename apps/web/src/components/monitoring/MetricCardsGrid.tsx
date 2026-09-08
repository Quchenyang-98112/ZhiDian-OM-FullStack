import { MetricCard } from './MetricCard';
import type { MetricCardItem } from './types';

export function MetricCardsGrid({ cards }: { cards: MetricCardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((card, index) => (
        <MetricCard key={card.label} card={card} index={index} />
      ))}
    </div>
  );
}
