import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { SetupStep } from '../../../lib/page-relations';

/** Single setup checklist link row for cross-links footer. */
export const SetupStepLink = ({ step, done }: { step: SetupStep; done: boolean }) => {
  const { t } = useTranslation();
  const StepIcon = step.icon;

  return (
    <Link
      to={`/settings?tab=${step.settingsTab}`}
      className="focus-ring flex items-center gap-2.5 rounded-lg p-1.5 text-xs transition-colors hover:bg-white/5"
    >
      {done ? (
        <CheckCircle2 size={13} className="shrink-0 text-emerald-400" aria-hidden="true" />
      ) : (
        <Circle size={13} className="shrink-0 text-(--color-muted)" aria-hidden="true" />
      )}
      <StepIcon size={12} className="shrink-0 text-(--color-muted)" aria-hidden="true" />
      <span className={done ? 'text-(--color-muted) line-through' : 'text-(--color-text)'}>
        {t(step.i18nKey)}
      </span>
    </Link>
  );
};
