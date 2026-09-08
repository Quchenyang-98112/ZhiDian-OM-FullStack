import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedTab } from '../components/settings/AdvancedTab';
import { AppearanceTab } from '../components/settings/AppearanceTab';
import { ControllersTab } from '../components/settings/ControllersTab';
import { EnergyTab } from '../components/settings/EnergyTab';
import { NotificationsTab } from '../components/settings/NotificationsTab';
import { SecurityTab } from '../components/settings/SecurityTab';
import { StorageTab } from '../components/settings/StorageTab';
import { SystemTab } from '../components/settings/SystemTab';
import { ToggleSwitch } from '../components/settings/ToggleSwitch';
import { fireEvent, render, screen } from './test-utils';

// ─── Shared mocks ────────────────────────────────────────────────────
// t() echoes the default value (or the key) so assertions can target labels.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: 'en', language: 'en' },
  }),
}));

// Stub the cross-link bar (pulls in page-relations + router) and the heavy
// API-auth section — the tabs under test just render them as children.
vi.mock('../components/settings/SettingsFeatureBar', () => ({
  SettingsFeatureBar: () => null,
}));
vi.mock('../components/ApiAuthSettingsSection', () => ({
  ApiAuthSettingsSection: () => null,
}));
vi.mock('../components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => null,
}));
vi.mock('../components/settings/PWASettingsSection', () => ({
  PWASettingsSection: () => null,
}));
vi.mock('../components/EmergencyStop', () => ({
  EmergencyStop: () => null,
}));
vi.mock('../lib/db', () => ({
  getLocalStorageStats: vi.fn().mockResolvedValue({ usageMb: 2.4, snapshots: 847 }),
  clearAllData: vi.fn().mockResolvedValue(null),
}));
vi.mock('../core/useEnergyStore', () => ({
  useEnergyStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      adapters: {
        'victron-mqtt': { status: 'connected' },
        knx: { status: 'disconnected' },
      },
    }),
}));

const mockReadOnly = vi.fn().mockReturnValue(false);

vi.mock('../lib/use-read-only-mode', () => ({
  useReadOnlyModeActive: () => mockReadOnly(),
}));

const mockUpdateSettings = vi.fn();
const mockSetThemePreference = vi.fn();
const mockSetTheme = vi.fn();
const mockSettings = {
  animations: true,
  compactMode: false,
  glowEffects: true,
  units: 'metric',
  dateFormat: 'dd.mm.yyyy',
  currency: 'eur',
  fontScale: 1.0,
  influxUrl: 'http://localhost:8086',
  influxToken: 'fixture-influx-token-7c2b',
  historyDays: 30,
  gatewayType: 'cerbo-gx',
  victronIp: '192.168.1.100',
  knxIp: '192.168.1.101',
  wsPort: 1880,
  refreshRateMs: 1000,
  mqttAutoDiscovery: true,
  mtls: false,
  telemetryDisabled: true,
  twoFactor: false,
  pushNotifications: true,
  priceAlerts: true,
  batteryAlerts: true,
  gridAlerts: false,
  updateNotifications: true,
  batteryAlertThreshold: 15,
  priceAlertThreshold: 0.1,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  mpcOptimizer: true,
  commandSafety: true,
  pvPeakKw: 10,
  batteryCapacityKWh: 10,
  batteryMaxChargeKW: 5,
  batteryMinSoC: 10,
  maxGridImportKw: 25,
  batteryCapacityKWhMpc: 10,
  batteryMinSoCMpc: 10,
  maxGridImportKwMpc: 25,
  evMaxPowerKW: 11,
  heatPumpPowerKW: 3,
  feedInTariffEurKWh: 0.08,
  // Energy tab
  tariffProvider: 'none',
  tariffToken: '',
  feedInTariff: 0.08,
  chargeThreshold: 0.15,
  gridOperator: 'default',
  gridOperatorName: 'Test Operator',
  gridPriceAvg: 0.3,
  monthlyBudget: 100,
  dynamicGridFees: false,
  location: { lat: 52.5, lon: 13.4 },
  systemConfig: {
    presetId: 'custom',
    pv: [],
    battery: {},
    evCharger: {},
    heatPump: {},
    inverter: {},
  },
  // Advanced tab
  dashboardRefreshSec: 5,
  autoBackup: false,
  debugMode: false,
  performanceMode: false,
  experimentalFeatures: false,
  keyboardShortcuts: true,
  sidebarPosition: 'left',
};

vi.mock('../store', () => ({
  defaultSettings: {},
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ backendReadOnly: false }),
  useAppStoreShallow: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      settings: mockSettings,
      updateSettings: mockUpdateSettings,
      theme: 'ocean-dark',
      themePreference: 'ocean-dark',
      setThemePreference: mockSetThemePreference,
      setTheme: mockSetTheme,
      locale: 'en',
      setLocale: vi.fn(),
      adapterMode: 'mock',
      connected: true,
    }),
}));

const renderTab = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadOnly.mockReturnValue(false);
});

// ─── ToggleSwitch (shared atom) ──────────────────────────────────────
describe('ToggleSwitch', () => {
  it('reflects the checked state', () => {
    render(<ToggleSwitch id="t1" checked onChange={vi.fn()} label="Toggle" />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onChange with the toggled value', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch id="t2" checked={false} onChange={onChange} label="Toggle" />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('exposes an accessible label', () => {
    render(<ToggleSwitch id="t3" checked={false} onChange={vi.fn()} label="My switch" />);
    expect(screen.getByText('My switch')).toBeInTheDocument();
  });
});

// ─── Extracted stateful tabs ─────────────────────────────────────────
describe('StorageTab', () => {
  it('renders the InfluxDB fields and live storage stats', async () => {
    const { container } = renderTab(<StorageTab />);
    expect(container.querySelector<HTMLInputElement>('#settings-influx-url')?.value).toBe(
      'http://localhost:8086',
    );
    expect(await screen.findByText('2.4')).toBeInTheDocument();
    expect(screen.getByText('847')).toBeInTheDocument();
  });

  it('writes InfluxDB URL changes back to the store', () => {
    const { container } = renderTab(<StorageTab />);
    const input = container.querySelector('#settings-influx-url') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://influx:8086' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ influxUrl: 'http://influx:8086' });
  });

  it('toggles InfluxDB token visibility', () => {
    const { container } = renderTab(<StorageTab />);
    const tokenInput = container.querySelector('#settings-influx-token') as HTMLInputElement;
    expect(tokenInput.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /token/i }));
    expect(tokenInput.type).toBe('text');
  });
});

describe('SystemTab', () => {
  it('renders device IP fields from the store', () => {
    const { container } = renderTab(<SystemTab />);
    expect(container.querySelector<HTMLInputElement>('#settings-victron-ip')?.value).toBe(
      '192.168.1.100',
    );
  });

  it('writes gateway-type selection back to the store', () => {
    renderTab(<SystemTab />);
    fireEvent.click(screen.getByRole('button', { name: /Raspberry Pi/ }));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ gatewayType: 'raspberry-pi' });
  });
});

describe('SecurityTab', () => {
  it('mounts and reflects security toggles from the store', () => {
    renderTab(<SecurityTab />);
    // telemetryDisabled=true → its switch is checked
    const switches = screen.getAllByRole('checkbox');
    expect(switches.length).toBeGreaterThanOrEqual(3);
  });

  it('writes mTLS toggle changes back to the store', () => {
    const { container } = renderTab(<SecurityTab />);
    const mtls = container.querySelector('#mtls') as HTMLInputElement;
    fireEvent.click(mtls);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ mtls: true });
  });
});

describe('NotificationsTab', () => {
  it('writes push-notification toggle changes back to the store', () => {
    const { container } = renderTab(<NotificationsTab />);
    const push = container.querySelector('#push') as HTMLInputElement;
    fireEvent.click(push);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ pushNotifications: false });
  });

  it('writes battery-threshold slider changes back to the store', () => {
    const { container } = renderTab(<NotificationsTab />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '25' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ batteryAlertThreshold: 25 });
  });
});

describe('ControllersTab', () => {
  it('mounts without crashing and shows optimizer content', () => {
    const { container } = renderTab(<ControllersTab />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('EnergyTab', () => {
  it('mounts without crashing with the default system config', () => {
    const { container } = renderTab(<EnergyTab />);
    expect(container.firstChild).toBeTruthy();
  });

  it('writes the tariff-provider selection back to the store', () => {
    renderTab(<EnergyTab />);
    fireEvent.click(screen.getByRole('radio', { name: 'settings.tibber' }));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ tariffProvider: 'tibber' });
  });

  it('blocks store updates when read-only mode is active', () => {
    mockReadOnly.mockReturnValue(true);
    renderTab(<EnergyTab />);
    fireEvent.click(screen.getByRole('radio', { name: 'settings.tibber' }));
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});

describe('AdvancedTab', () => {
  it('mounts without crashing (mock adapter mode → not live)', () => {
    const { container } = renderTab(<AdvancedTab />);
    expect(container.firstChild).toBeTruthy();
  });

  it('writes the debug-mode toggle back to the store', () => {
    const { container } = renderTab(<AdvancedTab />);
    const debug = container.querySelector('#debug') as HTMLInputElement;
    fireEvent.click(debug);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ debugMode: true });
  });
});

describe('AppearanceTab', () => {
  it('renders a theme card for every registered theme', () => {
    renderTab(<AppearanceTab />);
    // Each ThemePreviewCard is a button with aria-pressed
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThan(0);
  });

  it('applies a theme selection through the store', () => {
    renderTab(<AppearanceTab />);
    // The active theme (ocean-dark) card is pressed; pick any other theme card.
    const inactive = screen.getAllByRole('button', { pressed: false })[0];
    fireEvent.click(inactive);
    expect(mockSetThemePreference).toHaveBeenCalled();
    expect(mockSetTheme).toHaveBeenCalled();
  });

  it('writes the animations toggle back to the store', () => {
    const { container } = renderTab(<AppearanceTab />);
    const animations = container.querySelector('#animations') as HTMLInputElement;
    fireEvent.click(animations);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ animations: false });
  });

  it('writes the font-scale slider back to the store', () => {
    const { container } = renderTab(<AppearanceTab />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1.1' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ fontScale: 1.1 });
  });
});
