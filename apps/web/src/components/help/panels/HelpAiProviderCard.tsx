/** AI provider acknowledgment card on the Help About tab. */
export const HelpAiProviderCard = ({
  name,
  provider,
  desc,
  color,
}: {
  name: string;
  provider: string;
  desc: string;
  color: string;
}) => (
  <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
    <p className="mb-0.5 font-semibold text-sm" style={{ color }}>
      {name}
    </p>
    <p className="mb-1 font-medium text-(--color-muted) text-xs">{provider}</p>
    <p className="text-(--color-muted) text-xs">{desc}</p>
  </div>
);
