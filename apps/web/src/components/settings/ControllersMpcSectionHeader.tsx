import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sectionHeaderClass } from './styles';

/** MPC section title block extracted to limit JSX nesting depth. */
export function ControllersMpcSectionHeader() {
  const { t } = useTranslation();

  return (
    <h2 className={sectionHeaderClass}>
      <Gauge size={20} className="text-emerald-400" />
      {t('settings.mpcOptimizer', 'MPC Day-Ahead Optimizer')}
    </h2>
  );
}
