import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface HelpSectionShellProps {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  children: ReactNode;
}

/** Glass panel wrapper with icon header for integration guide sections. */
export const HelpSectionShell = ({
  icon: Icon,
  iconClassName,
  title,
  children,
}: HelpSectionShellProps) => (
  <div className="glass-panel-strong rounded-2xl p-6">
    <div className="mb-4 flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon size={20} />
      </div>
      <h3 className="fluid-text-lg font-semibold">{title}</h3>
    </div>
    {children}
  </div>
);
