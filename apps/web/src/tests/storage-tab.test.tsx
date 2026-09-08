import { describe, expect, it, vi } from 'vitest';
import { StorageTab } from '../components/settings/StorageTab';
import { clearAllData } from '../lib/db';
import { fireEvent, render, screen } from './test-utils';

const mockOpenDialog = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
  }),
}));

vi.mock('../components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
  useConfirmDialog: () => ({
    openDialog: mockOpenDialog,
    dialogProps: {},
  }),
}));

vi.mock('../components/settings/SettingsFeatureBar', () => ({
  SettingsFeatureBar: () => null,
}));

vi.mock('../lib/db', () => ({
  getLocalStorageStats: vi.fn().mockResolvedValue({ usageMb: 1.2, snapshots: 3 }),
  clearAllData: vi.fn().mockResolvedValue(null),
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (
    selector: (s: {
      settings: { influxUrl: string; influxToken: string; historyDays: number };
      updateSettings: () => void;
    }) => unknown,
  ) =>
    selector({
      settings: { influxUrl: 'http://localhost:8086', influxToken: '', historyDays: 30 },
      updateSettings: vi.fn(),
    }),
}));

describe('StorageTab', () => {
  it('opens a confirm dialog before clearing local cache', async () => {
    render(<StorageTab />);
    fireEvent.click(screen.getByText('Clear local cache'));

    const dialog = mockOpenDialog.mock.calls.at(-1)?.[0] as {
      onConfirm: () => Promise<void>;
    };
    await dialog.onConfirm();
    expect(clearAllData).toHaveBeenCalled();
  });

  it('toggles influx token visibility', () => {
    render(<StorageTab />);
    const tokenInput = screen.getByLabelText('settings.influxToken');
    expect(tokenInput).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByLabelText('settings.showToken'));
    expect(tokenInput).toHaveAttribute('type', 'text');
  });
});
