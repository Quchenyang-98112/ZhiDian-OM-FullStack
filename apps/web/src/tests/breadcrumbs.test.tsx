import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Translate keys to their known labels; fall back to the provided default so a
// *missing* route label surfaces as the raw lowercase segment (the bug we guard
// against), while a mapped key resolves to its human-readable translation.
const LABELS: Record<string, string> = {
  'nav.home': 'Home',
  'nav.settings': 'Settings',
  'nav.hardware': 'Hardware',
  'nav.aiKeys': 'AI Keys',
  'nav.breadcrumbs': 'Breadcrumbs',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown) => LABELS[key] ?? (typeof def === 'string' ? def : key),
  }),
}));

import { Breadcrumbs } from '../components/layout/Breadcrumbs';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Breadcrumbs />
    </MemoryRouter>,
  );
}

describe('Breadcrumbs', () => {
  it('renders a translated label for the hardware registry route (no raw segment)', () => {
    renderAt('/settings/hardware');
    // The current-page crumb must be the translated label, never the raw
    // lowercase URL segment "hardware".
    expect(screen.getByText('Hardware')).toBeTruthy();
    expect(screen.queryByText('hardware')).toBeNull();
  });

  it('translates the AI keys settings route too', () => {
    renderAt('/settings/ai');
    expect(screen.getByText('AI Keys')).toBeTruthy();
    expect(screen.queryByText('ai')).toBeNull();
  });
});
