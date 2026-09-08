import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

vi.mock('../components/AIOptimizerPanel', () => ({
  AIOptimizerPanel: () => <div data-testid="ai-panel" />,
}));

vi.mock('../components/SankeyDiagram', () => ({
  SankeyDiagram: () => <div data-testid="sankey" />,
}));

import { EnergyProvider } from '../core/EnergyContext';
import { CommandHub } from '../pages/CommandHub';
import { useAppStore } from '../store';

beforeEach(() => {
  vi.stubEnv('VITE_BACKEND_WS', 'false');
  useAppStore.setState({
    connected: false,
    adapterMode: 'mock',
    energyData: {
      pvPower: 0,
      gridPower: 0,
      batteryPower: 0,
      houseLoad: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      gridVoltage: 230,
      batteryVoltage: 48,
      pvYieldToday: 0,
      priceCurrent: 0.18,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CommandHub chrome', () => {
  it('does not duplicate the global simulation badge on the page header', () => {
    render(
      <MemoryRouter>
        <EnergyProvider>
          <CommandHub />
        </EnergyProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText('mode.simulationBadge')).not.toBeInTheDocument();
    expect(screen.getByText('commandHub.subtitle')).toBeInTheDocument();
    expect(screen.getByText('commandHub.metricsOverview')).toBeInTheDocument();
  });

  it('expands the secondary metrics disclosure', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EnergyProvider>
          <CommandHub />
        </EnergyProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('commandHub.showMoreMetrics'));
    expect(screen.getByText('commandHub.secondaryMetrics')).toBeInTheDocument();
  });
});
