import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/AIOptimizerPanel', () => ({
  AIOptimizerPanel: () => <div data-testid="ai-panel" />,
}));

vi.mock('../components/SankeyDiagram', () => ({
  SankeyDiagram: () => <div data-testid="sankey" />,
}));

import { EnergyProvider } from '../core/EnergyContext';
import i18n, { i18nReady } from '../i18n';
import CommandHub from '../pages/CommandHub';
import { useAppStore } from '../store';

async function renderCommandHub(locale: 'de' | 'en') {
  await i18n.changeLanguage(locale);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <EnergyProvider>
          <CommandHub />
        </EnergyProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('CommandHub locale chrome', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_BACKEND_WS', 'false');
    useAppStore.setState({
      connected: false,
      adapterMode: 'mock',
      energyData: {
        pvPower: 7850,
        gridPower: 1420,
        batteryPower: -2100,
        houseLoad: 3180,
        batterySoC: 72,
        heatPumpPower: 850,
        evPower: 3700,
        gridVoltage: 230,
        batteryVoltage: 48,
        pvYieldToday: 12.4,
        priceCurrent: 0.128,
      },
    });
    await i18nReady;
    if (!i18n.isInitialized) {
      await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders German Command Hub chrome when locale is de', async () => {
    await renderCommandHub('de');
    expect(screen.getByRole('heading', { level: 1, name: 'Kommandozentrale' })).toBeInTheDocument();
    expect(screen.getByText('Kennzahlen')).toBeInTheDocument();
    expect(screen.getByText('Echtzeit-Energiefluss')).toBeInTheDocument();
  });

  it('renders English Command Hub chrome when locale is en', async () => {
    await renderCommandHub('en');
    expect(screen.getByRole('heading', { level: 1, name: 'Command Hub' })).toBeInTheDocument();
    expect(screen.getByText('Key metrics')).toBeInTheDocument();
    expect(screen.getByText('Real-time Energy Flow')).toBeInTheDocument();
  });
});
