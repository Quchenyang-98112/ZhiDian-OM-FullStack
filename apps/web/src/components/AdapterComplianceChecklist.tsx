import { Circle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  COMPLIANCE_MATRIX,
  type ComplianceItem,
  type ComplianceStatus,
  STATUS_CONFIG,
} from './adapter-compliance-data';
import { ADAPTER_META, type AdapterType } from './adapter-config-types';

const DEFAULT_DISPLAY_ADAPTERS: AdapterType[] = ['victron', 'modbus', 'knx', 'ocpp', 'eebus'];

const ComplianceTableHeader = ({ displayAdapters }: { displayAdapters: AdapterType[] }) => {
  const { t } = useTranslation();

  return (
    <thead>
      <tr className="border-(--color-border) border-b">
        <th className="py-2 pr-4 text-left font-medium text-(--color-muted)">
          {t('adapterConfig.complianceTitle')}
        </th>
        {displayAdapters.map((type) => {
          const meta = ADAPTER_META[type];
          const Icon = meta.icon;
          return (
            <th key={type} className="px-2 py-2 text-center font-medium">
              <div className="flex flex-col items-center gap-1">
                <Icon size={14} className={meta.color} />
                <span className="text-[10px]">{t(`adapterConfig.type_${type}`)}</span>
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
};

const ComplianceTableRow = ({
  item,
  displayAdapters,
}: {
  item: ComplianceItem;
  displayAdapters: AdapterType[];
}) => {
  const { t } = useTranslation();

  return (
    <tr className="border-(--color-border)/50 border-b transition-colors hover:bg-(--color-surface)/50">
      <td className="py-2.5 pr-4">
        <p className="font-medium text-(--color-text)">{t(`adapterConfig.${item.key}`)}</p>
        <p className="mt-0.5 text-(--color-muted) text-[10px]">
          {t(`adapterConfig.${item.descKey}`)}
        </p>
      </td>
      {displayAdapters.map((type) => {
        const status = item.adapters[type];
        const cfg = STATUS_CONFIG[status];
        const StatusIcon = cfg.icon;
        return (
          <td key={type} className="px-2 py-2.5 text-center">
            <div className="flex flex-col items-center gap-0.5">
              <StatusIcon size={16} className={cfg.color} />
              <span className={`text-[9px] ${cfg.color}`}>{t(cfg.labelKey)}</span>
            </div>
          </td>
        );
      })}
    </tr>
  );
};

const ComplianceSummaryBadges = ({ displayAdapters }: { displayAdapters: AdapterType[] }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-4 pt-2">
      {displayAdapters.map((type) => {
        const meta = ADAPTER_META[type];
        const Icon = meta.icon;
        const counts = COMPLIANCE_MATRIX.reduce(
          (acc, item) => {
            acc[item.adapters[type]]++;
            return acc;
          },
          { compliant: 0, partial: 0, na: 0 } as Record<ComplianceStatus, number>,
        );
        return (
          <div
            key={type}
            className="flex items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-surface)/50 px-3 py-2"
          >
            <Icon size={14} className={meta.color} />
            <span className="font-medium text-xs">{t(`adapterConfig.type_${type}`)}</span>
            <div className="ml-1 flex items-center gap-1.5">
              <span className="flex items-center gap-0.5 text-emerald-400">
                <Circle size={6} fill="currentColor" />
                {counts.compliant}
              </span>
              <span className="flex items-center gap-0.5 text-amber-400">
                <Circle size={6} fill="currentColor" />
                {counts.partial}
              </span>
              <span className="flex items-center gap-0.5 text-(--color-muted)">
                <Circle size={6} fill="currentColor" />
                {counts.na}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface ComplianceChecklistProps {
  activeAdapters: AdapterType[];
}

/** Regulatory compliance matrix for enabled protocol adapters. */
export const ComplianceChecklist = ({ activeAdapters }: ComplianceChecklistProps) => {
  const { t } = useTranslation();
  const displayAdapters = activeAdapters.length > 0 ? activeAdapters : DEFAULT_DISPLAY_ADAPTERS;

  return (
    <section className="glass-panel-strong space-y-5 rounded-2xl p-6">
      <h2 className="fluid-text-lg flex items-center gap-2 border-(--color-border) border-b pb-4 font-medium text-lg">
        <ShieldCheck size={20} className="text-emerald-400" />
        {t('adapterConfig.complianceTitle')}
      </h2>
      <p className="text-(--color-muted) text-sm">{t('adapterConfig.complianceDescription')}</p>

      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full text-xs">
          <ComplianceTableHeader displayAdapters={displayAdapters} />
          <tbody>
            {COMPLIANCE_MATRIX.map((item) => (
              <ComplianceTableRow key={item.key} item={item} displayAdapters={displayAdapters} />
            ))}
          </tbody>
        </table>
      </div>

      <ComplianceSummaryBadges displayAdapters={displayAdapters} />
    </section>
  );
};
