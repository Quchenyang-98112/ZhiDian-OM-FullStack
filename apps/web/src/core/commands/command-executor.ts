import { toast } from 'sonner';
import type { AdapterCommand } from '../adapters/EnergyAdapter';
import type { CommandContext, ResolvedCommand } from './types';

export interface ExecuteResult {
  ok: boolean;
  reason?: 'readonly' | 'scope' | 'disabled' | 'error';
}

function resolveDisabledReason(
  cmd: ResolvedCommand,
  ctx: CommandContext,
): NonNullable<ExecuteResult['reason']> {
  if (cmd.blockedInReadOnly && ctx.isReadOnly) return 'readonly';
  if (cmd.disabledReasonKey === 'command.insufficientScope') return 'scope';
  return 'disabled';
}

function resolveHardwareCommand(cmd: ResolvedCommand, ctx: CommandContext): AdapterCommand | null {
  if (!cmd.hardwareCommand) return null;
  return typeof cmd.hardwareCommand === 'function' ? cmd.hardwareCommand(ctx) : cmd.hardwareCommand;
}

function requiresHardwareBridge(cmd: ResolvedCommand): boolean {
  return cmd.risk === 'danger' || cmd.risk === 'moderate' || cmd.risk === 'admin';
}

/**
 * Execute a resolved palette command with safety gates and usage tracking.
 */
export async function executeResolvedCommand(
  cmd: ResolvedCommand,
  ctx: CommandContext,
): Promise<ExecuteResult> {
  if (cmd.disabled) {
    if (cmd.disabledReasonKey) {
      toast.error(ctx.t(cmd.disabledReasonKey));
    }
    return { ok: false, reason: resolveDisabledReason(cmd, ctx) };
  }

  const hardware = resolveHardwareCommand(cmd, ctx);
  if (hardware && requiresHardwareBridge(cmd)) {
    if (!ctx.actions.executeHardwareCommand) {
      toast.error(ctx.t('command.hardwareBridgeMissing'));
      return { ok: false, reason: 'error' };
    }
    ctx.actions.executeHardwareCommand(hardware);
    ctx.actions.recordUsage(cmd.id);
    return { ok: true };
  }

  try {
    await cmd.execute(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : ctx.t('command.executeFailed');
    toast.error(message);
    return { ok: false, reason: 'error' };
  }

  ctx.actions.recordUsage(cmd.id);
  return { ok: true };
}
