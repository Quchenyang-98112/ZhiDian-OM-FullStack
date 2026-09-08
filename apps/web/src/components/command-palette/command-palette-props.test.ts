import { describe, expect, it, vi } from 'vitest';
import type { AdapterCommand } from '../../core/adapters/EnergyAdapter';
import { toControllerOptions } from './command-palette-props';

describe('toControllerOptions', () => {
  it('maps required palette props', () => {
    const onClose = vi.fn();
    expect(toControllerOptions({ isOpen: true, onClose })).toEqual({ isOpen: true, onClose });
  });

  it('includes optional action callbacks when provided', () => {
    const onOptimize = vi.fn();
    const onExportReport = vi.fn();
    const executeHardwareCommand = vi.fn() as (command: AdapterCommand) => void;

    expect(
      toControllerOptions({
        isOpen: false,
        onClose: vi.fn(),
        onOptimize,
        onExportReport,
        executeHardwareCommand,
      }),
    ).toEqual({
      isOpen: false,
      onClose: expect.any(Function),
      onOptimize,
      onExportReport,
      executeHardwareCommand,
    });
  });
});
