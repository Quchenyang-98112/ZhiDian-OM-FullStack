import type { ReactNode } from 'react';

/** Hardware or software requirements card on Help getting-started tab. */
export const HelpRequirementCard = ({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) => (
  <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <h4 className="font-medium text-sm">{title}</h4>
    </div>
    {children}
  </div>
);
