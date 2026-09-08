import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisteredAdapterSettingsSection } from '../components/settings/RegisteredAdapterSettingsSection';
import {
  clearAdapterSettingsSections,
  registerAdapterSettingsSection,
} from '../core/adapters/settings-section-registry';

const StubSection = ({ adapterId }: { adapterId: string; isReadOnly: boolean }) => (
  <div data-testid="stub-section">{adapterId}</div>
);

describe('RegisteredAdapterSettingsSection', () => {
  beforeEach(() => {
    clearAdapterSettingsSections();
    vi.restoreAllMocks();
  });

  it('renders a registered adapter settings section', () => {
    registerAdapterSettingsSection({
      adapterId: 'homeassistant-mqtt',
      order: 10,
      Component: StubSection,
    });

    render(<RegisteredAdapterSettingsSection adapterId="homeassistant-mqtt" />);
    expect(screen.getByTestId('stub-section')).toHaveTextContent('homeassistant-mqtt');
  });

  it('warns in dev mode when no section is registered', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(function suppressConsoleWarn() {
      return undefined;
    });

    const { container } = render(<RegisteredAdapterSettingsSection adapterId="missing-adapter" />);

    expect(container).toBeEmptyDOMElement();
    expect(warnSpy).toHaveBeenCalledWith(
      'No settings section registered for adapterId "missing-adapter"',
    );
  });
});
