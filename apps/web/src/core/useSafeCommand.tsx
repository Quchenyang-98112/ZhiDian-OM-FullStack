/**
 * useSafeCommand — Hook for sending hardware commands with safety guarantees
 *
 * Wraps sendAdapterCommand with:
 *   1. Zod schema validation
 *   2. Rate limiting
 *   3. Optional confirmation dialog (danger commands)
 *   4. 3-second timeout for auto-cancel
 *   5. Audit trail logging to IndexedDB
 *   6. Prometheus metric increment
 *
 * Usage:
 *   const { execute, pending, ConfirmationDialog } = useSafeCommand();
 *   execute({ type: 'SET_BATTERY_POWER', value: 2000 });
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ConfirmVariant } from '../components/ConfirmDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isLiveSafetyMode } from '../lib/adapter-mode';
import { useAppStore } from '../store';
import type { AdapterCommand } from './adapters/EnergyAdapter';
import {
  describeCommand,
  logCommandAudit,
  requiresConfirmation,
  validateCommandShape,
} from './command-safety';
import { sendAdapterCommand } from './useEnergyStore';

interface SafeCommandState {
  pending: boolean;
  lastError: string | null;
}

/** Pure audit log helper — extracted to avoid impure calls during render */
function auditLog(
  command: AdapterCommand,
  status: 'confirmed' | 'rejected' | 'executed' | 'failed' | 'emergency_stop',
  error?: string,
): void {
  void logCommandAudit({
    timestamp: Date.now(),
    commandType: command.type,
    value: command.value,
    targetDeviceId: command.targetDeviceId,
    status,
    error,
  });
}

interface CommandResult {
  ok: boolean;
  error?: string;
}

async function executeCommand(
  command: AdapterCommand,
  setState: (s: SafeCommandState) => void,
): Promise<CommandResult> {
  setState({ pending: true, lastError: null });
  try {
    // Await the real dispatch outcome — the authoritative "executed"/"failed"
    // audit row is written by BaseAdapter.sendCommand, so we do NOT log an
    // (optimistic, possibly-contradictory) outcome here.
    const accepted = await sendAdapterCommand(command);
    if (accepted) {
      setState({ pending: false, lastError: null });
      return { ok: true };
    }
    const notAccepted = 'command_not_accepted';
    setState({ pending: false, lastError: notAccepted });
    return { ok: false, error: notAccepted };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Command execution failed';
    setState({ pending: false, lastError: errorMsg });
    return { ok: false, error: errorMsg };
  }
}

export function useSafeCommand() {
  const { t } = useTranslation();
  const isLive = isLiveSafetyMode(useAppStore((s) => s.adapterMode));
  const [state, setState] = useState<SafeCommandState>({ pending: false, lastError: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<AdapterCommand | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateSetterRef = useRef(setState);

  useEffect(() => {
    stateSetterRef.current = setState;
  }, [setState]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  /** Surface command outcome to the user via a toast (i18n) */
  const notifyResult = (res: CommandResult) => {
    if (res.ok) {
      toast.success(t('safety.commandExecuted', 'Command executed'));
      return;
    }
    const detail =
      res.error === 'command_not_accepted'
        ? t('safety.commandNotAccepted', 'No connected adapter accepted the command')
        : res.error;
    toast.error(
      detail
        ? `${t('safety.commandFailed', 'Command failed')}: ${detail}`
        : t('safety.commandFailed', 'Command failed'),
    );
  };

  /** Execute a command — validates, optionally shows confirmation, then sends */
  const execute = (command: AdapterCommand) => {
    // Step 1: Validate shape only (no rate-token spend — the single token is
    // consumed once at the dispatch boundary in BaseAdapter.sendCommand)
    const validation = validateCommandShape(command);
    if (!validation.valid) {
      const reason = validation.error ?? t('safety.validationFailed', 'Validation failed');
      stateSetterRef.current({ pending: false, lastError: reason });
      auditLog(command, 'rejected', validation.error);
      toast.error(`${t('safety.commandRejected', 'Command rejected')}: ${reason}`);
      return;
    }

    // Step 2: Check if confirmation needed
    if (requiresConfirmation(command)) {
      setPendingCommand(command);
      setConfirmOpen(true);

      // 3-second auto-cancel timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setConfirmOpen(false);
        setPendingCommand(null);
        auditLog(command, 'rejected', 'Confirmation timeout (3s)');
      }, 3000);
      return;
    }

    // Step 3: Direct execution (non-danger commands like KNX lights)
    void executeCommand(command, stateSetterRef.current).then(notifyResult);
  };

  const handleConfirm = async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pendingCommand) {
      auditLog(pendingCommand, 'confirmed');
      const res = await executeCommand(pendingCommand, stateSetterRef.current);
      notifyResult(res);
    }
    setPendingCommand(null);
  };

  const handleCancel = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pendingCommand) {
      auditLog(pendingCommand, 'rejected', 'User cancelled');
    }
    setPendingCommand(null);
    setConfirmOpen(false);
  };

  // Build dialog props from pending command
  const dialogVariant: ConfirmVariant = pendingCommand
    ? describeCommand(pendingCommand).severity
    : 'warning';

  const dialogTitle = pendingCommand
    ? t('safety.confirmCommandTitle', 'Gerätebefehl bestätigen')
    : '';

  const dialogBaseMessage = pendingCommand
    ? t(describeCommand(pendingCommand).labelKey, {
        type: pendingCommand.type,
        value: String(pendingCommand.value),
      })
    : '';

  // In live mode, prepend an unmissable hardware warning to the confirmation.
  const dialogMessage =
    pendingCommand && isLive ? (
      <div className="space-y-2">
        <p>{dialogBaseMessage}</p>
        <p className="font-bold text-red-400">
          {t(
            'safety.liveHardwareWarning',
            'This affects LIVE hardware — the command will control real equipment.',
          )}
        </p>
      </div>
    ) : (
      dialogBaseMessage
    );

  /** Render this in your component tree to show the confirmation dialog */
  const ConfirmationDialog = () => (
    <ConfirmDialog
      isOpen={confirmOpen}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title={dialogTitle}
      message={dialogMessage}
      confirmText={t('safety.executeCommand', 'Befehl ausführen')}
      cancelText={t('common.cancel', 'Abbrechen')}
      variant={dialogVariant}
      loading={state.pending}
    />
  );

  return {
    execute,
    pending: state.pending,
    lastError: state.lastError,
    ConfirmationDialog,
  };
}
