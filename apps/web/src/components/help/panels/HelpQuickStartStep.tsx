import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Numbered quick-start step link for Help getting-started tab. */
export const HelpQuickStartStep = ({
  step,
  title,
  desc,
  icon,
  link,
}: {
  step: number;
  title: string;
  desc: string;
  icon: ReactNode;
  link: string;
}) => (
  <Link
    to={link}
    className="focus-ring flex gap-4 rounded-xl border border-(--color-border) bg-(--color-surface) p-4 transition-colors hover:border-(--color-primary)/40 hover:bg-white/5"
  >
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--color-primary)/15 font-bold text-(--color-primary) text-sm">
      {step}
    </div>
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-(--color-primary)">{icon}</span>
        <h4 className="font-medium text-sm">{title}</h4>
      </div>
      <p className="text-(--color-muted) text-xs leading-relaxed">{desc}</p>
    </div>
  </Link>
);
