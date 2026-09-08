import type { ReactNode } from 'react';

/** Single labeled form control — keeps adapter field groups within JSX depth 4. */
export const AdapterConfigLabeledField = ({
  id,
  label,
  children,
  className = 'space-y-2',
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <label htmlFor={id} className="font-medium text-(--color-muted) text-xs">
      {label}
    </label>
    {children}
  </div>
);
