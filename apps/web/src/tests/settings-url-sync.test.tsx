import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../pages/Settings';
import SettingsUnified from '../pages/SettingsUnified';
import { fireEvent, render, screen } from './test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: 'en', language: 'en' },
  }),
}));

vi.mock('../components/settings/ReadOnlySettingsBanner', () => ({
  ReadOnlySettingsBanner: () => null,
}));

vi.mock('../components/settings/SettingsTabPanels', () => ({
  SettingsTabPanels: ({ activeTab }: { activeTab: string }) => (
    <div data-testid="active-tab">{activeTab}</div>
  ),
}));

vi.mock('../components/settings/settings-tab-definitions', () => ({
  buildSettingsTabs: () => [
    { key: 'appearance', label: 'Appearance', icon: null },
    { key: 'adapters', label: 'Adapters', icon: null },
  ],
}));

vi.mock('../store', () => ({
  useAppStoreShallow: () => ({
    settings: {},
    updateSettings: vi.fn(),
  }),
}));

vi.mock('../lib/settings-transfer', () => ({
  triggerSettingsExport: vi.fn(),
  triggerSettingsImport: vi.fn(),
}));

vi.mock('../components/ui/PageCrossLinks', () => ({
  PageCrossLinks: () => null,
}));

vi.mock('../pages/PluginsPage', () => ({
  default: () => <div>plugins-page</div>,
}));

vi.mock('../pages/Help', () => ({
  Help: () => <div>help-page</div>,
}));

const LocationDisplay = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
};

describe('settings URL sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives the active tab from ?tab= and updates the URL on click', () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=adapters']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <>
                <Settings />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('active-tab')).toHaveTextContent('adapters');

    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
    expect(screen.getByTestId('active-tab')).toHaveTextContent('appearance');
  });

  it('derives unified section from ?section=help', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?section=help&tab=faq']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <>
                <SettingsUnified />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('help-page')).toBeInTheDocument();
  });
});
