/** Single category card in the Help About tech stack grid. */
export const HelpTechStackCard = ({ category, items }: { category: string; items: string }) => (
  <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
    <p className="mb-1 font-semibold text-(--color-primary) text-xs uppercase tracking-wider">
      {category}
    </p>
    <p className="text-(--color-muted) text-xs">{items}</p>
  </div>
);
