import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AlertRule } from './types';
import { severityClasses } from './utils';

export function AlertRuleItem({ rule }: { rule: AlertRule }) {
  const { t } = useTranslation();
  return (
    <div key={rule.name} className="rounded-xl bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {rule.active ? (
          <>
            <XCircle size={14} className="shrink-0 text-red-400" aria-hidden="true" />
            <span className="sr-only">{t('monitoring.alertActive')}</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" aria-hidden="true" />
            <span className="sr-only">{t('monitoring.alertInactive')}</span>
          </>
        )}
        <span className="truncate font-medium text-(--color-text) text-sm">{rule.name}</span>
        <span
          className={`ml-auto shrink-0 rounded px-1.5 py-0.5 font-semibold text-[9px] uppercase ${severityClasses(
            rule.severity,
          )}`}
        >
          {rule.severity}
        </span>
      </div>
      <p className="mt-1 text-(--color-muted) text-[10px]">{rule.desc}</p>
      <div className="mt-1 flex items-center gap-2 font-mono text-(--color-muted) text-[9px]">
        <code className="truncate">{rule.expr}</code>
        <span className="shrink-0">{t('monitoring.ruleFor', { duration: rule.for })}</span>
      </div>
    </div>
  );
}
