import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HelpIntegrationPanel } from '../components/help/panels/HelpIntegrationPanel';
import { HelpShortcutsPanel } from '../components/help/panels/HelpShortcutsPanel';
import { HelpTroubleshootingPanel } from '../components/help/panels/HelpTroubleshootingPanel';
import { RelatedPageCard } from '../components/ui/cross-links/RelatedPageCard';
import { SetupProgressSection } from '../components/ui/cross-links/SetupProgressSection';
import { PAGE_REGISTRY } from '../lib/page-relations';
import { render, screen } from './test-utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: 'en', language: 'en' },
  }),
}));

describe('help panels', () => {
  it('renders integration guide sections', () => {
    render(<HelpIntegrationPanel />);
    expect(screen.getByText('help.integrationGuideTitle')).toBeInTheDocument();
    expect(screen.getByText('help.cerboGxTitle')).toBeInTheDocument();
    expect(screen.getByText('help.rpiTitle')).toBeInTheDocument();
    expect(screen.getByText('help.venusTitle')).toBeInTheDocument();
    expect(screen.getByText('help.knxTitle')).toBeInTheDocument();
    expect(screen.getByText('help.highEndTitle')).toBeInTheDocument();
  });

  it('renders keyboard shortcut groups', () => {
    render(<HelpShortcutsPanel />);
    expect(screen.getByText('help.keyboardShortcuts')).toBeInTheDocument();
    expect(screen.getByText('help.shortcutNav')).toBeInTheDocument();
    expect(screen.getByText('help.shortcutActions')).toBeInTheDocument();
    expect(screen.getByText('help.shortcutCmdK')).toBeInTheDocument();
  });

  it('renders troubleshooting disclosures and performance tips', () => {
    render(<HelpTroubleshootingPanel />);
    expect(screen.getByText('help.troubleshootingTitle')).toBeInTheDocument();
    expect(screen.getByText('help.troubleConnection')).toBeInTheDocument();
    expect(screen.getByText('help.perfTips')).toBeInTheDocument();
    expect(screen.getByText('help.perf1')).toBeInTheDocument();
  });
});

describe('cross-links components', () => {
  it('renders setup progress with help link when helpTab is set', () => {
    render(
      <MemoryRouter>
        <SetupProgressSection
          completedSteps={2}
          totalSteps={5}
          settingsObj={{}}
          helpTab="integration"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('crossLinks.setupProgress')).toBeInTheDocument();
    expect(screen.getByText('crossLinks.viewHelp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crossLinks\.viewHelp/i })).toHaveAttribute(
      'href',
      '/help?tab=integration',
    );
  });

  it('omits help link when helpTab is not provided', () => {
    render(
      <MemoryRouter>
        <SetupProgressSection completedSteps={5} totalSteps={5} settingsObj={{}} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('crossLinks.viewHelp')).not.toBeInTheDocument();
    expect(screen.getByText('crossLinks.setupComplete')).toBeInTheDocument();
  });

  it('renders related page card with translated labels', () => {
    const page = PAGE_REGISTRY.monitoring;
    render(
      <MemoryRouter>
        <RelatedPageCard page={page} />
      </MemoryRouter>,
    );
    expect(screen.getByText(page.i18nKey)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', page.path);
  });
});
