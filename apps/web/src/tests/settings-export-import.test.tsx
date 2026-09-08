import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../pages/Settings';
import { fireEvent, render, screen } from './test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
  }),
}));

vi.mock('../components/settings/SettingsTabPanels', () => ({
  SettingsTabPanels: () => <div>tab-panel</div>,
}));

vi.mock('../components/settings/ReadOnlySettingsBanner', () => ({
  ReadOnlySettingsBanner: () => null,
}));

const mockOpenDialog = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock('../components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
  useConfirmDialog: () => ({
    openDialog: mockOpenDialog,
    dialogProps: {},
  }),
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (
    selector: (s: { settings: object; updateSettings: () => void }) => unknown,
  ) => selector({ settings: { theme: 'ocean-dark' }, updateSettings: mockUpdateSettings }),
}));

const mockDownloadElement = (click = vi.fn()) => {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'a') {
        return { click, href: '', download: '' } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName, options);
    },
  );
  return click;
};

describe('Settings export/import actions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockOpenDialog.mockClear();
    mockUpdateSettings.mockClear();
  });

  it('wires export and import buttons to the transfer hook', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTitle('Export settings'));
    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }));

    fireEvent.click(screen.getByTitle('Import settings'));
    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ variant: 'warning' }));
  });

  it('runs the export download handler from the settings header', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    const click = mockDownloadElement();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() }),
    );

    fireEvent.click(screen.getByTitle('Export settings'));
    const dialog = mockOpenDialog.mock.calls.at(-1)?.[0] as { onConfirm: () => void };
    dialog.onConfirm();
    expect(click).toHaveBeenCalled();
  });
});
