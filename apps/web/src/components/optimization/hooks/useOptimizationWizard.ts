import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizard } from '../../../components/ui/WizardStepper';
import { useEnergyContext } from '../../../core/EnergyContext';
import { buildOptimizerRecommendations, runMpcOptimization } from '../../../lib/optimizer';
import {
  fetchTariffForecast,
  generatePredictiveRecommendation,
  type PredictiveRecommendation,
  type TariffForecast,
} from '../../../lib/predictive-ai';
import { useAppStoreShallow } from '../../../store';
import type { OptimizerRecommendation } from '../../../types';

/** A single point in the 24-hour tariff/renewable forecast chart series. */
export type ForecastPoint = { time: string; price: number; renewable: number };

/**
 * Number of wizard steps (Analyse → Suggestions → Confirm). Single source of
 * truth for both the `useWizard` bounds and the next-step clamp so navigation
 * limits can never drift apart.
 */
const WIZARD_STEP_COUNT = 3;

/**
 * All state, side effects, and derived data for the OptimizationAI wizard.
 * The page component is a thin orchestrator that renders the values this hook
 * returns; keeping the logic here makes the analysis pipeline unit-testable and
 * the page a pure layout.
 */
export function useOptimizationWizard() {
  const { t } = useTranslation();
  const { data: energyData, connected } = useEnergyContext();
  const settings = useAppStoreShallow((s) => s.settings);
  const isDemo = !connected;

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [forecast, setForecast] = useState<TariffForecast[]>([]);
  const [recommendations, setRecommendations] = useState<OptimizerRecommendation[]>([]);
  const [aiRecommendation, setAiRecommendation] = useState<PredictiveRecommendation | null>(null);
  const [applied, setApplied] = useState(false);

  const wizard = useWizard(WIZARD_STEP_COUNT);

  // ── Step 1: Run analysis ───────────────────────────────────────────
  async function runAnalysis() {
    setLoading(true);
    setApplied(false);

    try {
      // Fetch tariff forecast (API key managed via encrypted Dexie store)
      const tariffData = await fetchTariffForecast(settings.tariffProvider, '');
      setForecast(tariffData);

      // Run MPC optimizer
      runMpcOptimization(energyData, settings);

      // Build rule-based + MPC recommendations
      const recs = buildOptimizerRecommendations(energyData, settings);
      setRecommendations(recs);

      // Generate predictive AI recommendation
      const aiRec = await generatePredictiveRecommendation(energyData, tariffData, settings);
      setAiRecommendation(aiRec);
    } catch {
      // Fall back to rule-based recommendations and clear any stale AI result
      // from a prior run so the wizard never shows a mismatched recommendation.
      setRecommendations(buildOptimizerRecommendations(energyData, settings));
      setAiRecommendation(null);
    } finally {
      setLoading(false);
    }
  }

  // ── Wizard navigation ──────────────────────────────────────────────
  function handleStart() {
    setWizardOpen(true);
    setStep(0);
    void runAnalysis();
  }

  function handleNext() {
    if (wizard.isLastStep(step)) {
      // Apply optimizations (in production this dispatches real adapter commands)
      setApplied(true);
      setTimeout(() => setWizardOpen(false), 1800);
      return;
    }
    setStep((s) => Math.min(s + 1, WIZARD_STEP_COUNT - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleClose() {
    setWizardOpen(false);
    setStep(0);
  }

  // ── Derived data ───────────────────────────────────────────────────
  const chartData = forecast.slice(0, 24).map((f) => ({
    time: f.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: Number((f.pricePerKwh * 100).toFixed(1)),
    renewable: Math.round(f.renewable),
  }));

  const hasData = energyData.pvPower > 0 || energyData.houseLoad > 0 || energyData.gridPower !== 0;

  return {
    t,
    energyData,
    isDemo,
    wizardOpen,
    step,
    setStep,
    loading,
    recommendations,
    aiRecommendation,
    applied,
    wizard,
    chartData,
    hasData,
    handleStart,
    handleNext,
    handleBack,
    handleClose,
  };
}
