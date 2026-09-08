import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { fireEvent, render, screen } from './test-utils';

// Mock react-i18next
const mockChangeLanguage = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { lang?: string; defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: {
      changeLanguage: mockChangeLanguage,
      resolvedLanguage: 'de',
    },
  }),
}));

// Mock zustand store
const mockSetLocale = vi.fn();
vi.mock('../store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      locale: 'de',
      setLocale: mockSetLocale,
    }),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should render DE and EN buttons', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('de')).toBeInTheDocument();
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('should have a group role with accessible label', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('should mark current locale as pressed', () => {
    render(<LanguageSwitcher />);
    const deButton = screen.getByText('de');
    expect(deButton).toHaveAttribute('aria-pressed', 'true');
    const enButton = screen.getByText('en');
    expect(enButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('should call setLocale and changeLanguage on click', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('en'));
    expect(mockSetLocale).toHaveBeenCalledWith('en');
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
  });

  it('should persist language choice to localStorage', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('en'));
    expect(localStorage.getItem('nexus-hems-language')).toBe('en');
  });
});
