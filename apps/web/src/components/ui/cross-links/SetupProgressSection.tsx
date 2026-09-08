import { ArrowRight, CheckCircle2, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SETUP_STEPS } from '../../../lib/page-relations';
import { SetupStepLink } from './SetupStepLink';

const SetupProgressRing = ({ completed, total }: { completed: number; total: number }) => {
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <title>
        Setup progress: {completed}/{total}
      </title>
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="3"
        opacity={0.3}
      />
      <motion.circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke={pct >= 100 ? '#22ff88' : '#00f0ff'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut' }}
        transform="rotate(-90 22 22)"
      />
      <text
        x="22"
        y="22"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-(--color-text) font-semibold text-[11px]"
      >
        {completed}/{total}
      </text>
    </svg>
  );
};

export interface SetupProgressSectionProps {
  completedSteps: number;
  totalSteps: number;
  settingsObj: Record<string, unknown>;
  helpTab?: string;
}

/** Setup checklist ring, compact step list, and contextual help link. */
export const SetupProgressSection = ({
  completedSteps,
  totalSteps,
  settingsObj,
  helpTab,
}: SetupProgressSectionProps) => {
  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-(--color-border) bg-(--color-surface)/50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-400" aria-hidden="true" />
        <h3 className="font-semibold text-(--color-text) text-sm">
          {t('crossLinks.setupProgress')}
        </h3>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <SetupProgressRing completed={completedSteps} total={totalSteps} />
        <div>
          <p className="font-medium text-(--color-text) text-sm">
            {t('crossLinks.stepsCompleted', { count: completedSteps, total: totalSteps })}
          </p>
          <p className="text-(--color-muted) text-[11px]">
            {completedSteps >= totalSteps
              ? t('crossLinks.setupComplete')
              : t('crossLinks.setupIncomplete')}
          </p>
        </div>
      </div>

      <div className="mb-4 space-y-1.5">
        {SETUP_STEPS.slice(0, 4).map((step) => (
          <SetupStepLink key={step.id} step={step} done={step.checkFn(settingsObj)} />
        ))}
      </div>

      {helpTab ? (
        <Link
          to={`/help?tab=${helpTab}`}
          className="focus-ring mt-2 flex items-center gap-2 rounded-lg border border-(--color-border)/20 bg-white/3 p-2.5 text-sm transition-colors hover:bg-white/8"
        >
          <HelpCircle size={14} className="shrink-0 text-(--color-primary)" aria-hidden="true" />
          <span className="flex-1 text-(--color-text)">{t('crossLinks.viewHelp')}</span>
          <ArrowRight size={12} className="shrink-0 text-(--color-muted)" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
};
