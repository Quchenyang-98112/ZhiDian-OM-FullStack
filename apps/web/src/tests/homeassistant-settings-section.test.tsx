import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistantSettingsSection } from '../components/settings/HomeAssistantSettingsSection';
import { fireEvent, render, screen } from './test-utils';

const mockReadOnly = vi.fn().mockReturnValue(false);
const mockSave = vi.fn().mockResolvedValue({ ok: true });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string; error?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? opts?.error ?? key),
  }),
}));

vi.mock('../lib/use-read-only-mode', () => ({
  useReadOnlyModeActive: () => mockReadOnly(),
}));

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStore: (selector: (s: { adapters: Record<string, { enabled: boolean }> }) => unknown) =>
    selector({ adapters: { 'homeassistant-mqtt': { enabled: false } } }),
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (
    selector: (s: {
      settings: { mqttAutoDiscovery: boolean };
      updateSettings: () => void;
    }) => unknown,
  ) => selector({ settings: { mqttAutoDiscovery: true }, updateSettings: vi.fn() }),
}));

vi.mock('../core/homeassistant-settings-save', () => ({
  saveHomeAssistantSettings: (...args: unknown[]) => mockSave(...args),
}));

describe('HomeAssistantSettingsSection', () => {
  const sectionProps = { adapterId: 'homeassistant-mqtt', isReadOnly: false };

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.mockReturnValue(false);
    mockSave.mockResolvedValue({ ok: true });
  });

  it('saves HA WS API settings', async () => {
    render(<HomeAssistantSettingsSection {...sectionProps} />);
    fireEvent.change(screen.getByLabelText('settings.haToken'), {
      target: { value: 'token-value' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await vi.waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          haMode: 'ha-ws-api',
          haToken: 'token-value',
        }),
      );
    });
  });

  it('saves MQTT broker settings after switching mode', async () => {
    render(<HomeAssistantSettingsSection {...sectionProps} />);
    fireEvent.click(screen.getByText('settings.haModeMqtt'));
    fireEvent.change(screen.getByLabelText('mqtt.brokerUrl'), {
      target: { value: '192.168.1.44' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await vi.waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          haMode: 'mqtt-broker',
          mqttHost: '192.168.1.44',
        }),
      );
    });
  });

  it('surfaces save failures', async () => {
    mockSave.mockResolvedValue({ ok: false, error: 'boom' });
    render(<HomeAssistantSettingsSection {...sectionProps} />);
    fireEvent.click(screen.getByText('common.save'));
    await vi.waitFor(() => {
      expect(mockSave).toHaveBeenCalled();
    });
  });

  it('blocks save actions when the isReadOnly prop is set', () => {
    mockReadOnly.mockReturnValue(false);
    render(<HomeAssistantSettingsSection {...sectionProps} isReadOnly />);
    fireEvent.click(screen.getByText('common.save'));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('honors the isReadOnly prop over the read-only hook', async () => {
    mockReadOnly.mockReturnValue(true);
    render(<HomeAssistantSettingsSection {...sectionProps} isReadOnly={false} />);
    fireEvent.click(screen.getByText('common.save'));

    await vi.waitFor(() => {
      expect(mockSave).toHaveBeenCalled();
    });
  });
});
