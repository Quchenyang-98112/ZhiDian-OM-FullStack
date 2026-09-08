import { Check, ChevronLeft, ChevronRight, Loader2, Plug, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  createRegisteredAdapter,
  listRegisteredAdapters,
} from '../../core/adapters/adapter-registry';
import type { AdapterConnectionConfig } from '../../core/adapters/EnergyAdapter';
import type { DeviceDefinition } from '../../core/hardware-registry';
import { useEnergyStore, useEnergyStoreBase } from '../../core/useEnergyStore';
import { isLiveHardwareBuildAllowed } from '../../lib/adapter-mode';
import {
  defaultHostForDevice,
  defaultPortForAdapter,
  suggestAdapterIdForDevice,
} from '../../lib/hardware-adapter-map';
import { useAppStore } from '../../store';
import { SelectField } from '../ui/SelectField';

type WizardStep = 'adapter' | 'connection' | 'test' | 'done';

export interface AddAdapterWizardProps {
  device?: DeviceDefinition;
  onClose: () => void;
}

export function AddAdapterWizard({ device, onClose }: AddAdapterWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const enableAdapter = useEnergyStore((s) => s.enableAdapter);
  const addContribAdapter = useEnergyStore((s) => s.addContribAdapter);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const suggestedId = useMemo(() => (device ? suggestAdapterIdForDevice(device) : null), [device]);
  const registered = useMemo(() => listRegisteredAdapters(), []);

  const [step, setStep] = useState<WizardStep>(suggestedId ? 'connection' : 'adapter');
  const [adapterId, setAdapterId] = useState(suggestedId ?? registered[0]?.id ?? 'victron-mqtt');
  const [name, setName] = useState(
    device ? `${device.manufacturer} ${device.model}` : t('hardwareRegistry.wizard.defaultName'),
  );
  const [host, setHost] = useState(defaultHostForDevice(device));
  const [port, setPort] = useState(defaultPortForAdapter(adapterId, device));
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testMessage, setTestMessage] = useState('');

  const inputClass =
    'w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-(--color-text) text-sm focus:border-(--color-primary)/70 focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20';

  const connectionConfig: Partial<AdapterConnectionConfig> = {
    name,
    host,
    port: Number(port),
  };

  const runConnectionTest = async () => {
    setTesting(true);
    setTestOk(null);
    setTestMessage('');

    if (!isLiveHardwareBuildAllowed()) {
      await new Promise((r) => setTimeout(r, 600));
      setTestOk(true);
      setTestMessage(t('hardwareRegistry.wizard.mockTestOk'));
      setTesting(false);
      return;
    }

    const probe = createRegisteredAdapter(adapterId, connectionConfig);
    if (!probe) {
      setTestOk(false);
      setTestMessage(t('hardwareRegistry.wizard.testFailed'));
      setTesting(false);
      return;
    }
    // BaseAdapter.connect() is non-throwing by contract (ADR-024): on failure it
    // records the failure and sets status 'error' instead of rejecting. Capture the
    // error message via the status callback so a failed probe is not reported as OK.
    let lastError: string | undefined;
    probe.onStatus((status, error) => {
      if (status === 'error' && error) lastError = error;
    });
    try {
      await Promise.race([
        probe.connect(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(t('hardwareRegistry.wizard.testTimeout'))), 8000);
        }),
      ]);
      if (probe.status === 'error') {
        throw new Error(lastError ?? t('hardwareRegistry.wizard.testFailed'));
      }
      await probe.disconnect();
      setTestOk(true);
      setTestMessage(t('hardwareRegistry.wizard.testSuccess'));
    } catch (err) {
      setTestOk(false);
      setTestMessage(err instanceof Error ? err.message : t('hardwareRegistry.wizard.testFailed'));
    } finally {
      probe.destroy();
      setTesting(false);
    }
  };

  const applySettingsPatch = () => {
    if (adapterId === 'victron-mqtt') {
      updateSettings({ victronIp: host, wsPort: Number(port) });
    } else if (adapterId === 'knx') {
      updateSettings({ knxIp: host });
    }
  };

  const finishWizard = () => {
    const state = useEnergyStoreBase.getState();
    if (!state.adapters[adapterId]) {
      addContribAdapter(adapterId, connectionConfig);
    }
    applySettingsPatch();
    enableAdapter(adapterId, true);
    toast.success(t('hardwareRegistry.wizard.enabledToast', { name }));
    setStep('done');
    setTimeout(() => {
      onClose();
      navigate('/settings?tab=adapters');
    }, 1200);
  };

  const stepTitle = (s: WizardStep) => t(`hardwareRegistry.wizard.step_${s}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-adapter-wizard-title"
    >
      <motion.div
        className="glass-panel-strong max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="add-adapter-wizard-title" className="font-semibold text-lg">
              {t('hardwareRegistry.wizard.title')}
            </h2>
            <p className="text-(--color-muted) text-sm">{stepTitle(step)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-(--color-muted) hover:bg-white/10"
            aria-label={t('common.close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {device ? (
          <p className="mb-4 rounded-xl bg-white/5 px-3 py-2 text-(--color-muted) text-xs">
            {device.manufacturer} · {device.model}
          </p>
        ) : null}

        {step === 'adapter' && (
          <div className="space-y-4">
            <SelectField
              id="wizard-adapter-id"
              label={t('hardwareRegistry.wizard.pickAdapter')}
              value={adapterId}
              onChange={(e) => {
                setAdapterId(e.target.value);
                setPort(defaultPortForAdapter(e.target.value, device));
              }}
            >
              {registered.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName ?? entry.id}
                </option>
              ))}
            </SelectField>
          </div>
        )}

        {step === 'connection' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="wizard-name" className="font-medium text-sm">
                {t('hardwareRegistry.wizard.instanceName')}
              </label>
              <input
                id="wizard-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="wizard-host" className="font-medium text-sm">
                  {t('hardwareRegistry.wizard.host')}
                </label>
                <input
                  id="wizard-host"
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.100"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="wizard-port" className="font-medium text-sm">
                  {t('hardwareRegistry.wizard.port')}
                </label>
                <input
                  id="wizard-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {step === 'test' && (
          <div className="space-y-4">
            <p className="text-(--color-muted) text-sm">{t('hardwareRegistry.wizard.testHint')}</p>
            <button
              type="button"
              onClick={() => void runConnectionTest()}
              disabled={testing || !host.trim()}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-primary)/15 px-4 py-3 font-medium text-(--color-primary) text-sm disabled:opacity-50"
            >
              {testing ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Plug size={16} aria-hidden="true" />
              )}
              {t('hardwareRegistry.wizard.runTest')}
            </button>
            {testMessage ? (
              <p
                className={`rounded-xl px-3 py-2 text-sm ${
                  testOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}
                role="status"
              >
                {testMessage}
              </p>
            ) : null}
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Check size={32} className="text-emerald-400" aria-hidden="true" />
            <p className="font-medium">{t('hardwareRegistry.wizard.done')}</p>
          </div>
        )}

        {step !== 'done' && (
          <div className="mt-6 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (step === 'connection' && !suggestedId) setStep('adapter');
                else if (step === 'test') setStep('connection');
                else onClose();
              }}
              className="focus-ring flex items-center gap-1 rounded-xl px-4 py-2 text-(--color-muted) text-sm hover:bg-white/5"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {step === 'adapter' ? t('common.cancel') : t('hardwareRegistry.wizard.back')}
            </button>
            <button
              type="button"
              disabled={
                (step === 'connection' && (!host.trim() || !name.trim())) ||
                (step === 'test' && testOk !== true)
              }
              onClick={() => {
                if (step === 'adapter') setStep('connection');
                else if (step === 'connection') setStep('test');
                else if (step === 'test') finishWizard();
              }}
              className="focus-ring flex items-center gap-1 rounded-xl bg-(--color-primary) px-4 py-2 font-medium text-sm text-white disabled:opacity-50"
            >
              {step === 'test' ? t('hardwareRegistry.wizard.enable') : t('common.confirm')}
              {step !== 'test' ? <ChevronRight size={16} aria-hidden="true" /> : null}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
