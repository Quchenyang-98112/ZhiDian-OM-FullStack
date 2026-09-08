import type { TFunction } from 'i18next';
import { motion } from 'motion/react';
import type { ComponentType } from 'react';
import { AdapterConfigConnectionFields } from './adapter-config-entry/AdapterConfigConnectionFields';
import { AdapterConfigEebusFields } from './adapter-config-entry/AdapterConfigEebusFields';
import { AdapterConfigEntryActions } from './adapter-config-entry/AdapterConfigEntryActions';
import { AdapterConfigKnxFields } from './adapter-config-entry/AdapterConfigKnxFields';
import { AdapterConfigOcppFields } from './adapter-config-entry/AdapterConfigOcppFields';
import { AdapterConfigSecurityFields } from './adapter-config-entry/AdapterConfigSecurityFields';
import { AdapterConfigVictronFields } from './adapter-config-entry/AdapterConfigVictronFields';
import { ToggleSwitch } from './adapter-config-shared';
import { ADAPTER_META, type AdapterEntry } from './adapter-config-types';
import { Disclosure } from './ui/Disclosure';

export interface AdapterConfigEntrySectionProps {
  adapter: AdapterEntry;
  isExpanded: boolean;
  onExpandChange: (open: boolean) => void;
  onUpdate: (patch: Partial<AdapterEntry>) => void;
  showToken: boolean;
  onToggleToken: () => void;
  onRemove: () => void;
  onSave: () => void;
  isReadOnly: boolean;
  isSaving: boolean;
  isSaved: boolean;
  inputClass: string;
  sectionClass: string;
  t: TFunction;
}

const TYPE_SPECIFIC_FIELDS: Record<
  AdapterEntry['type'],
  ComponentType<{
    adapter: AdapterEntry;
    onUpdate: (patch: Partial<AdapterEntry>) => void;
    inputClass: string;
    t: TFunction;
  }> | null
> = {
  victron: AdapterConfigVictronFields,
  modbus: null,
  knx: AdapterConfigKnxFields,
  ocpp: AdapterConfigOcppFields,
  eebus: AdapterConfigEebusFields,
};

/** Collapsible per-adapter configuration section in the Settings adapters tab. */
export const AdapterConfigEntrySection = ({
  adapter,
  isExpanded,
  onExpandChange,
  onUpdate,
  showToken,
  onToggleToken,
  onRemove,
  onSave,
  isReadOnly,
  isSaving,
  isSaved,
  inputClass,
  sectionClass,
  t,
}: AdapterConfigEntrySectionProps) => {
  const meta = ADAPTER_META[adapter.type];
  const Icon = meta.icon;
  const TypeFields = TYPE_SPECIFIC_FIELDS[adapter.type];
  const guardedUpdate = (patch: Partial<AdapterEntry>) => {
    if (!isReadOnly) onUpdate(patch);
  };
  const fieldProps = { adapter, onUpdate: guardedUpdate, inputClass, t, isReadOnly };

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={sectionClass}
    >
      <Disclosure
        variant="nested"
        className="border-0 bg-transparent shadow-none"
        open={isExpanded}
        onOpenChange={onExpandChange}
        title={adapter.name}
        subtitle={
          <>
            {t(`adapterConfig.type_${adapter.type}`)}
            {adapter.host ? ` · ${adapter.host}:${adapter.port}` : ''}
          </>
        }
        icon={
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl bg-(--color-surface-strong) ${meta.color}`}
          >
            <Icon size={18} />
          </div>
        }
        actions={
          <>
            <div className="hidden gap-1 sm:flex">
              {meta.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-full border border-(--color-border) bg-(--color-surface) px-2 py-0.5 text-(--color-muted) text-[10px]"
                >
                  {t(`adapterConfig.cap_${cap}`)}
                </span>
              ))}
            </div>
            <ToggleSwitch
              id={`enable-${adapter.id}`}
              checked={adapter.enabled}
              onChange={(v) => guardedUpdate({ enabled: v })}
              label={t('adapterConfig.enabled')}
              disabled={isReadOnly}
            />
          </>
        }
      >
        <div className="space-y-5">
          <AdapterConfigConnectionFields {...fieldProps} />
          <AdapterConfigSecurityFields
            {...fieldProps}
            showToken={showToken}
            onToggleToken={onToggleToken}
          />
          {TypeFields ? <TypeFields {...fieldProps} /> : null}
          <AdapterConfigEntryActions
            onRemove={onRemove}
            onSave={onSave}
            isReadOnly={isReadOnly}
            isSaving={isSaving}
            isSaved={isSaved}
            t={t}
          />
        </div>
      </Disclosure>
    </motion.section>
  );
};
