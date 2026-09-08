import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOptimizationWizard } from '../components/optimization/hooks/useOptimizationWizard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const energy = vi.hoisted(() => ({
  data: { pvPower: 1000, houseLoad: 800, gridPower: 500, batterySoC: 50, priceCurrent: 0.3 },
  connected: true,
}));
vi.mock('../core/EnergyContext', () => ({
  useEnergyContext: () => energy,
}));

vi.mock('../store', () => ({
  useAppStoreShallow: (selector: (s: { settings: unknown }) => unknown) =>
    selector({ settings: { tariffProvider: 'awattar' } }),
}));

const buildRecs = vi.hoisted(() =>
  vi.fn(() => [
    { id: 'r1', severity: 'positive', titleKey: 'k1', descriptionKey: 'd1', value: '1 kW' },
  ]),
);
const runMpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/optimizer', () => ({
  runMpcOptimization: runMpc,
  buildOptimizerRecommendations: buildRecs,
}));

const fetchForecast = vi.hoisted(() => vi.fn(async () => []));
const genRec = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../lib/predictive-ai', () => ({
  fetchTariffForecast: fetchForecast,
  generatePredictiveRecommendation: genRec,
}));

vi.mock('../components/ui/WizardStepper', () => ({
  useWizard: () => ({
    isLastStep: (s: number) => s === 2,
    canGoBack: (s: number) => s > 0,
  }),
}));

describe('useOptimizationWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    energy.connected = true;
  });

  it('starts closed on step 0 with demo derived from connection', () => {
    energy.connected = false;
    const { result } = renderHook(() => useOptimizationWizard());
    expect(result.current.wizardOpen).toBe(false);
    expect(result.current.step).toBe(0);
    expect(result.current.isDemo).toBe(true);
    expect(result.current.hasData).toBe(true); // pvPower > 0
  });

  it('handleStart opens the wizard and runs the analysis pipeline', async () => {
    const { result } = renderHook(() => useOptimizationWizard());
    await act(async () => {
      result.current.handleStart();
    });
    expect(result.current.wizardOpen).toBe(true);
    expect(fetchForecast).toHaveBeenCalledWith('awattar', '');
    expect(runMpc).toHaveBeenCalled();
    await waitFor(() => expect(result.current.recommendations).toHaveLength(1));
    expect(result.current.loading).toBe(false);
  });

  it('falls back to rule-based recommendations when the forecast fetch throws', async () => {
    fetchForecast.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useOptimizationWizard());
    await act(async () => {
      result.current.handleStart();
    });
    await waitFor(() => expect(result.current.recommendations).toHaveLength(1));
    expect(buildRecs).toHaveBeenCalled();
  });

  it('navigates forward and back within bounds', () => {
    const { result } = renderHook(() => useOptimizationWizard());
    act(() => result.current.handleNext());
    expect(result.current.step).toBe(1);
    act(() => result.current.handleNext());
    expect(result.current.step).toBe(2);
    act(() => result.current.handleBack());
    expect(result.current.step).toBe(1);
  });

  it('handleClose resets the wizard', async () => {
    const { result } = renderHook(() => useOptimizationWizard());
    act(() => result.current.handleStart());
    // Flush the async runAnalysis promise fired by handleStart so it resolves
    // inside act() rather than after the test (avoids act() warnings / bleed).
    await act(async () => {});
    act(() => result.current.handleClose());
    expect(result.current.wizardOpen).toBe(false);
    expect(result.current.step).toBe(0);
  });
});
