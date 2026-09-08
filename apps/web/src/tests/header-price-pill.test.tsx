import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'units.ctPerKwh' ? 'ct/kWh' : key),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

import {
  AppShellHeaderBatteryPill,
  AppShellHeaderGridPill,
  AppShellHeaderPricePill,
  AppShellHeaderPvPill,
} from '../components/layout/AppShellHeaderTickerPills';

describe('AppShellHeaderPricePill', () => {
  it('displays compact cent/kWh for the mobile pill', () => {
    render(<AppShellHeaderPricePill priceCurrent={0.128} />);
    expect(screen.getByText('12.8 ct/kWh')).toBeInTheDocument();
  });
});

describe('AppShell header KPI pills', () => {
  it('renders PV power using the shared formatter', () => {
    render(<AppShellHeaderPvPill pvPower={1420} />);
    expect(screen.getByText('1.4 kW')).toBeInTheDocument();
  });

  it('renders battery SoC rounded to whole percent', () => {
    render(<AppShellHeaderBatteryPill batterySoC={71.6} />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('labels grid export when power is negative', () => {
    render(<AppShellHeaderGridPill gridPower={-1420} />);
    expect(screen.getByTitle('header.gridExport')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('labels grid import when power is positive', () => {
    render(<AppShellHeaderGridPill gridPower={980} />);
    expect(screen.getByTitle('header.gridImport')).toBeInTheDocument();
    expect(screen.getByText('↓')).toBeInTheDocument();
  });
});
