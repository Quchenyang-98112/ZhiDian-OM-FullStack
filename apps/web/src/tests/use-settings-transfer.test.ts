import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerSettingsExport, triggerSettingsImport } from '../lib/settings-transfer';

const t = ((key: string) => key) as TFunction;
const mockOpenDialog = vi.fn();
const mockUpdateSettings = vi.fn();
const confirm = { openDialog: mockOpenDialog, dialogProps: {} };

describe('settings-transfer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockOpenDialog.mockClear();
    mockUpdateSettings.mockClear();
  });

  it('opens export confirmation and downloads settings JSON', () => {
    triggerSettingsExport({ theme: 'ocean-dark' } as never, confirm as never, t, vi.fn());
    const dialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const click = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:settings'),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement);

    dialog.onConfirm();
    expect(click).toHaveBeenCalled();
  });

  it('imports valid settings JSON', async () => {
    triggerSettingsImport(mockUpdateSettings, confirm as never, t, vi.fn());
    const importDialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input);

    importDialog.onConfirm();

    const file = {
      size: 10,
      text: async () => JSON.stringify({ victronIp: '10.0.0.5', historyDays: 14 }),
    };
    await input.onchange?.({ target: { files: [file] } } as unknown as Event);

    expect(mockUpdateSettings).toHaveBeenCalled();
  });

  it('rejects oversized import files', async () => {
    triggerSettingsImport(mockUpdateSettings, confirm as never, t, vi.fn());
    const importDialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input);
    importDialog.onConfirm();

    await input.onchange?.({
      target: { files: [{ size: 2 * 1024 * 1024, text: async () => '' }] },
    } as unknown as Event);

    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });

  it('shows an error for invalid JSON imports', async () => {
    triggerSettingsImport(mockUpdateSettings, confirm as never, t, vi.fn());
    const importDialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input);
    importDialog.onConfirm();

    await input.onchange?.({
      target: { files: [{ size: 10, text: async () => 'not-json' }] },
    } as unknown as Event);

    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });

  it('rejects schema-invalid settings objects', async () => {
    triggerSettingsImport(mockUpdateSettings, confirm as never, t, vi.fn());
    const importDialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input);
    importDialog.onConfirm();

    await input.onchange?.({
      target: {
        files: [{ size: 20, text: async () => JSON.stringify({ wsPort: 'not-a-number' }) }],
      },
    } as unknown as Event);

    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });

  it('rejects top-level JSON arrays', async () => {
    triggerSettingsImport(mockUpdateSettings, confirm as never, t, vi.fn());
    const importDialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input);
    importDialog.onConfirm();

    await input.onchange?.({
      target: { files: [{ size: 10, text: async () => JSON.stringify(['x']) }] },
    } as unknown as Event);

    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });

  it('ignores import when no file is selected', async () => {
    triggerSettingsImport(mockUpdateSettings, confirm as never, t, vi.fn());
    const importDialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input);
    importDialog.onConfirm();
    await input.onchange?.({ target: { files: [] } } as unknown as Event);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});
