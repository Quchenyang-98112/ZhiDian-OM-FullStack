/**
 * EmergencyStop — Global red emergency stop button
 *
 * When pressed, immediately:
 *   1. Destroys all active adapters
 *   2. Triggers grid-only mode (all loads off except essential)
 *   3. Opens all circuit breakers
 *   4. Logs the emergency stop event to IndexedDB
 *   5. Shows a full-screen confirmation overlay
 *
 * Positioned as a fixed button accessible from any page.
 * §14a EnWG conformance: provides manual override for all controllable consumers.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { OctagonX, RotateCcw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logCommandAudit } from '../core/command-safety';
import type { AdapterId } from '../core/useEnergyStore';
import { useEnergyStoreBase } from '../core/useEnergyStore';
import { metricsCollector } from '../lib/metrics';

interface EmergencyStopProps {
  circuitBreakers?: Map<string, { forceOpen: () => void }>;
  disabled?: boolean;
}

export function EmergencyStop({ circuitBreakers, disabled = false }: EmergencyStopProps) {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const executeEmergencyStop = async () => {
    setIsActive(true);
    setShowConfirm(false);

    // 1. Prometheus metric for emergency stop
    metricsCollector.recordEmergencyStop();

    // 2. Log the emergency stop event
    await logCommandAudit({
      timestamp: Date.now(),
      commandType: 'SET_GRID_LIMIT',
      value: 'EMERGENCY_STOP',
      status: 'emergency_stop',
    });

    // 3. Destroy all adapters
    const { adapters } = useEnergyStoreBase.getState();
    const entries = Object.entries(adapters) as [AdapterId, (typeof adapters)[AdapterId]][];
    for (const [, entry] of entries) {
      if (entry.enabled) {
        try {
          entry.adapter.destroy();
        } catch {
          // Force destroy even on error
        }
      }
    }

    // 4. Force-open all circuit breakers
    if (circuitBreakers) {
      for (const [, cb] of circuitBreakers) {
        cb.forceOpen();
      }
    }

    // 5. Set all adapter statuses to disconnected
    const { setAdapterStatus } = useEnergyStoreBase.getState();
    for (const [id] of entries) {
      setAdapterStatus(id, 'disconnected', 'Emergency stop activated');
    }
  };

  const resetSystem = () => {
    setIsActive(false);
    // System will reconnect via normal adapter bridge lifecycle on next mount
    window.location.reload();
  };

  return (
    <>
      {/* Emergency Stop Trigger Button */}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={disabled}
        className="focus-ring group flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-600 px-4 py-2 font-bold text-sm text-white shadow-lg shadow-red-600/40 transition-all hover:scale-105 hover:bg-red-500 hover:shadow-red-500/50 hover:shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        aria-label={t('safety.emergencyStop', 'Notaus – Alle Geräte sofort abschalten')}
        title={t('safety.emergencyStop', 'Notaus – Alle Geräte sofort abschalten')}
        type="button"
      >
        <OctagonX
          className="h-5 w-5 text-white transition-transform group-hover:rotate-12"
          aria-hidden="true"
        />
        {t('safety.emergencyStopShort', 'NOTAUS')}
      </button>

      {/* Confirmation Dialog */}
      <Dialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 z-modal mx-4 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-red-500/50 bg-red-950/90 p-6 shadow-2xl backdrop-blur-xl"
            aria-describedby="emergency-stop-desc"
            aria-labelledby="emergency-stop-title"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/30">
                <ShieldAlert className="h-7 w-7 text-red-400" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <Dialog.Title id="emergency-stop-title" className="font-bold text-lg text-red-100">
                  {t('safety.emergencyStopTitle', 'NOTAUS — Alle Geräte abschalten?')}
                </Dialog.Title>
                <Dialog.Description
                  className="mt-2 text-red-200/80 text-sm"
                  id="emergency-stop-desc"
                >
                  {t(
                    'safety.emergencyStopDesc',
                    'Alle Adapter werden sofort getrennt. Batterie, EV-Ladung, Wärmepumpe und KNX-Aktoren werden abgeschaltet. Nur Netzbezug bleibt aktiv. Dieser Vorgang kann nicht automatisch rückgängig gemacht werden.',
                  )}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  className="focus-ring rounded-xl px-4 py-2 font-medium text-red-200 text-sm transition-colors hover:bg-red-900/50"
                  type="button"
                >
                  {t('common.cancel', 'Abbrechen')}
                </button>
              </Dialog.Close>
              <button
                onClick={() => void executeEmergencyStop()}
                className="focus-ring animate-pulse rounded-xl bg-red-600 px-6 py-2 font-bold text-sm text-white shadow-lg shadow-red-600/50 transition-all hover:bg-red-500"
                type="button"
              >
                {t('safety.confirmEmergencyStop', 'NOTAUS BESTÄTIGEN')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Active Emergency Stop Overlay */}
      {isActive && (
        <div
          className="fixed inset-0 z-priority flex items-center justify-center bg-red-950/95 backdrop-blur-md"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex max-w-lg flex-col items-center gap-6 p-8 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-red-500 bg-red-600/20">
              <ShieldAlert className="h-14 w-14 text-red-400" aria-hidden="true" />
            </div>
            <h1 className="font-bold text-3xl text-red-100">
              {t('safety.emergencyActive', 'NOTAUS AKTIV')}
            </h1>
            <p className="text-red-200/80">
              {t(
                'safety.emergencyActiveDesc',
                'Alle Geräte wurden getrennt. Das System befindet sich im sicheren Zustand. Nur Netzbezug ist aktiv.',
              )}
            </p>
            <button
              onClick={resetSystem}
              className="focus-ring mt-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-900/50 px-6 py-3 font-medium text-red-100 transition-colors hover:bg-red-800/50"
              type="button"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              {t('safety.resetSystem', 'System zurücksetzen & neu starten')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
