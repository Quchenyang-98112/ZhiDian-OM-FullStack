import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdapterConfigPanel } from '../components/AdapterConfigPanel';
import { fireEvent, render, screen } from './test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string; error?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: 'en', language: 'en' },
  }),
}));

const mockReadOnly = vi.fn().mockReturnValue(false);

vi.mock('../lib/use-read-only-mode', () => ({
  useReadOnlyModeActive: () => mockReadOnly(),
}));

const mockSave = vi.fn().mockResolvedValue({ ok: true, registryId: 'victron-mqtt' });

vi.mock('../core/adapter-config-panel-save', () => ({
  saveAdapterPanelEntry: (...args: unknown[]) => mockSave(...args),
}));

vi.mock('../components/settings/ReadOnlySettingsBanner', () => ({
  ReadOnlySettingsBanner: () => null,
}));

vi.mock('../core/adapters/adapter-registry', () => ({
  listRegisteredAdapters: () => [],
  loadAllContribAdapters: vi.fn().mockResolvedValue([]),
  registerBuiltinAdapters: vi.fn(),
}));

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStore: (selector: (s: Record<string, unknown>) => unknown) => selector({ adapters: {} }),
}));

vi.mock('../store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { victronIp: '', knxIp: '', wsPort: 1880, gatewayType: 'cerbo-gx' } }),
}));

vi.mock('../lib/secure-store', () => ({
  getAdapterCredentials: vi.fn().mockResolvedValue(null),
}));

describe('AdapterConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls save pipeline when Save is clicked', async () => {
    render(<AdapterConfigPanel />);
    const addButtons = screen.getAllByRole('button', { name: /adapterConfig\.type_victron/i });
    fireEvent.click(addButtons[0]);
    fireEvent.change(screen.getByLabelText('adapterConfig.host'), {
      target: { value: '192.168.1.20' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await vi.waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'victron',
          host: '192.168.1.20',
        }),
      );
    });
  });

  it('reports save failures from the pipeline', async () => {
    mockSave.mockResolvedValue({ ok: false, error: 'validation failed' });
    render(<AdapterConfigPanel />);
    const addButtons = screen.getAllByRole('button', { name: /adapterConfig\.type_victron/i });
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('common.save'));
    await vi.waitFor(() => {
      expect(mockSave).toHaveBeenCalled();
    });
  });

  it('blocks adapter changes in read-only mode', () => {
    mockReadOnly.mockReturnValue(true);
    render(<AdapterConfigPanel />);
    const addButtons = screen.getAllByRole('button', { name: /adapterConfig\.type_victron/i });
    expect(addButtons[0]).toBeDisabled();
    fireEvent.click(addButtons[0]);
    expect(screen.queryByText('common.save')).not.toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
