import { describe, expect, it, vi } from 'vitest';
import { ReadOnlySettingsBanner } from '../components/settings/ReadOnlySettingsBanner';
import { render, screen } from './test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockReadOnly = vi.fn().mockReturnValue(false);

vi.mock('../lib/use-read-only-mode', () => ({
  useReadOnlyModeActive: () => mockReadOnly(),
}));

describe('ReadOnlySettingsBanner', () => {
  it('renders nothing outside read-only mode', () => {
    mockReadOnly.mockReturnValue(false);
    const { container } = render(<ReadOnlySettingsBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the warning banner in read-only mode', () => {
    mockReadOnly.mockReturnValue(true);
    render(<ReadOnlySettingsBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('mode.readOnlyBannerWarning');
  });
});
