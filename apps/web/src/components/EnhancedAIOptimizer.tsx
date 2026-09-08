/**
 * Enhanced AI Optimizer with BYOK multi-provider support
 */

import type { AIProvider } from '@nexus-hems/ai-core';
import type { Remote } from 'comlink';
import type { TFunction } from 'i18next';
import { Key, Loader2, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { callAI, getAIMode, getPreferredLocalModel } from '../core/aiClient';
import { useAIWorker } from '../core/useAIWorker';
import { useLLMWorker } from '../core/useLLMWorker';
import { getActiveProvider } from '../lib/ai-keys';
import { type AppState, useAppStoreShallow } from '../store';
import type { LLMWorkerAPI, OptimizerRecommendation } from '../workers/worker-types';

interface AIRecommendation {
  title: string;
  description: string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
}

const VALID_PRIORITIES = new Set<string>(['high', 'medium', 'low']);

interface OptimizerState {
  energyData: AppState['energyData'];
  settings: AppState['settings'];
}

export function EnhancedAIOptimizer() {
  const { t } = useTranslation();
  const energyData = useAppStoreShallow((s) => s.energyData);
  const settings = useAppStoreShallow((s) => s.settings);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [aiRecommendations, setAIRecommendations] = useState<AIRecommendation[]>([]);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);

  useEffect(() => {
    const checkProvider = async () => {
      const provider = await getActiveProvider();
      setHasProvider(provider !== null);
    };
    checkProvider().catch(() => {
      setHasProvider(false);
    });
  }, []);

  const aiWorker = useAIWorker();
  const mode = getAIMode();
  const prefersLocal = mode === 'local' || mode === 'eco';
  const llmWorker = useLLMWorker(prefersLocal);
  const [basicRecommendations, setBasicRecommendations] = useState<OptimizerRecommendation[]>([]);

  useEffect(() => {
    let cancelled = false;
    aiWorker
      .computeRecommendations(
        { ...energyData },
        { chargeThreshold: settings.chargeThreshold, maxGridImportKw: settings.maxGridImportKw },
      )
      .then((recs) => {
        if (!cancelled) setBasicRecommendations(recs);
      })
      .catch((err) => {
        // Worker recommendation failures are non-fatal; basic recs stay empty.
        console.error('Basic recommendations failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [aiWorker, energyData, settings.chargeThreshold, settings.maxGridImportKw]);

  const handleOptimizeNow = async () => {
    setIsOptimizing(true);
    setError(null);

    try {
      const prompt = buildOptimizerPrompt({ energyData, settings });
      const result = await runInference({
        mode,
        prefersLocal,
        hasProvider,
        prompt,
        llmWorker,
      });
      setAIRecommendations(parseRecommendations(result.text));
      setLastProvider(result.provider);
    } catch (err) {
      handleOptimizationError(err, setError, setHasProvider, t);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:rounded-3xl sm:p-6">
      <OptimizerHeader
        hasProvider={hasProvider}
        isOptimizing={isOptimizing}
        prefersLocal={prefersLocal}
        onOptimize={handleOptimizeNow}
      />

      <ErrorBanner error={error} />

      <BasicRecommendations
        basicRecommendations={basicRecommendations}
        hasAIRecommendations={aiRecommendations.length > 0}
      />

      <AIRecommendations recommendations={aiRecommendations} provider={lastProvider} />
    </div>
  );
}

/** Brand names for AI provider ids. Static — hoisted to module scope so it is
 * not reallocated on every render. Brand names stay untranslated. */
const PROVIDER_BRANDS: Record<string, string> = {
  webllm: 'WebLLM',
  transformers: 'Transformers.js',
  onnx: 'ONNX Runtime',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  xai: 'xAI',
  groq: 'Groq',
  ollama: 'Ollama',
};

/** Human-readable label for an AI provider id. Only the on-device heuristic
 * engine gets a descriptive, translated label; brand names pass through. */
function useProviderLabel(provider: string | null): string | null {
  const { t } = useTranslation();
  if (!provider) return null;
  if (provider === 'heuristic') {
    return t('ai.providerHeuristic');
  }
  return PROVIDER_BRANDS[provider] ?? provider;
}

function OptimizerHeader({
  hasProvider,
  isOptimizing,
  prefersLocal,
  onOptimize,
}: {
  hasProvider: boolean | null;
  isOptimizing: boolean;
  prefersLocal: boolean;
  onOptimize: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <OptimizerTitle />
        <p className="mt-1 text-(--color-muted) text-xs sm:text-sm">
          {t('ai.optimizerSubtitle', 'AI-powered recommendations for optimal energy management')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/settings/ai"
          className="btn-secondary focus-ring flex items-center gap-2 rounded-full px-3 py-2 text-sm"
          aria-label={t('aiSettings.title', 'AI Provider Keys')}
        >
          <Key className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('aiSettings.title', 'AI Provider Keys')}</span>
        </Link>
        <button
          type="button"
          onClick={onOptimize}
          disabled={isOptimizing || (hasProvider === false && !prefersLocal)}
          className="btn-primary focus-ring flex items-center gap-2 text-sm"
          aria-label={
            isOptimizing ? t('ai.optimizing', 'Optimizing...') : t('ai.optimizeNow', 'Optimize Now')
          }
        >
          <OptimizeButtonContent isOptimizing={isOptimizing} />
        </button>
      </div>
    </div>
  );
}

function OptimizerTitle() {
  const { t } = useTranslation();
  return (
    <h2 className="fluid-text-lg flex items-center gap-2 font-semibold text-(--color-text)">
      <Sparkles
        className="h-5 w-5 shrink-0 text-(--color-primary) sm:h-6 sm:w-6"
        aria-hidden="true"
      />
      <span className="truncate">{t('ai.optimizerTitle', 'AI Energy Optimizer')}</span>
      <span className="shrink-0 rounded-full bg-(--color-primary)/20 px-2 py-0.5 font-medium text-(--color-primary) text-xs">
        BYOK
      </span>
    </h2>
  );
}

function OptimizeButtonContent({ isOptimizing }: { isOptimizing: boolean }) {
  const { t } = useTranslation();
  if (isOptimizing) {
    return (
      <>
        <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" aria-hidden="true" />
        <span className="xs:inline hidden">{t('ai.optimizing', 'Optimizing...')}</span>
      </>
    );
  }
  return (
    <>
      <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      <span className="xs:inline hidden">{t('ai.optimizeNow', 'Optimize Now')}</span>
    </>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <p className="text-red-400 text-sm">{error}</p>
    </div>
  );
}

function BasicRecommendations({
  basicRecommendations,
  hasAIRecommendations,
}: {
  basicRecommendations: OptimizerRecommendation[];
  hasAIRecommendations: boolean;
}) {
  const { t } = useTranslation();
  if (hasAIRecommendations) return null;
  return (
    <section aria-label={t('optimizer.basicRecommendations', 'Basic Recommendations')}>
      <div className="@container grid @sm:grid-cols-2 grid-cols-1 @sm:gap-4 gap-3">
        {basicRecommendations.map((rec, i) => (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`rounded-2xl border p-3 sm:p-4 ${getSeverityStyles(rec.severity)}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate font-medium text-xs sm:text-sm">{t(rec.titleKey)}</span>
              <span className="shrink-0 font-mono text-(--color-muted) text-xs">{rec.value}</span>
            </div>
            <p className="text-(--color-muted) text-xs">{t(rec.descriptionKey)}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AIRecommendations({
  recommendations,
  provider,
}: {
  recommendations: AIRecommendation[];
  provider: string | null;
}) {
  return (
    <AnimatePresence mode="wait">
      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3 sm:space-y-4"
        >
          <ProviderBadge provider={provider} />
          {recommendations.map((rec, i) => (
            <AIRecommendationCard key={rec.title} rec={rec} index={i} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shows which engine actually produced the recommendations, so heuristic
 * output is never mistaken for an LLM (F-03). */
function ProviderBadge({ provider }: { provider: string | null }) {
  const { t } = useTranslation();
  const label = useProviderLabel(provider);
  if (!label) return null;
  return (
    <p className="text-(--color-muted) text-xs">
      {t('ai.generatedBy')} <span className="font-medium text-(--color-text)">{label}</span>
    </p>
  );
}

function AIRecommendationCard({ rec, index }: { rec: AIRecommendation; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-2xl border p-4 sm:p-5 ${getPriorityStyles(rec.priority)}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3">
        <h3 className="font-semibold text-(--color-text) text-sm sm:text-base">{rec.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-1 font-medium text-xs ${getPriorityBadge(rec.priority)}`}
        >
          {rec.priority.toUpperCase()}
        </span>
      </div>
      <p className="mb-2 text-(--color-muted) text-xs sm:mb-3 sm:text-sm">{rec.description}</p>
      <div className="flex items-center gap-2 text-(--color-primary) text-xs">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {rec.impact}
      </div>
    </motion.div>
  );
}

function buildOptimizerPrompt({ energyData, settings }: OptimizerState) {
  return `You are an AI energy optimization expert for a Home Energy Management System (HEMS).

Current System State:
- PV Generation: ${energyData.pvPower}W
- Battery SoC: ${energyData.batterySoC}%
- Battery Power: ${energyData.batteryPower}W
- House Load: ${energyData.houseLoad}W
- Grid Power: ${energyData.gridPower}W (${energyData.gridPower > 0 ? 'importing' : 'exporting'})
- Current Tariff Price: ${energyData.priceCurrent}€/kWh
- Heat Pump Status: ${energyData.heatPumpPower}W
- EV Charging: ${energyData.evPower}W

Settings:
- Charge Threshold: ${settings.chargeThreshold}€/kWh
- Max Grid Import: ${settings.maxGridImportKw}kW
- Tariff Provider: ${settings.tariffProvider}

Analyze the current situation and provide 3-5 actionable optimization recommendations to:
1. Minimize electricity costs
2. Maximize self-consumption
3. Reduce CO₂ emissions
4. Optimize battery usage
5. Smart EV charging strategy

Return ONLY a valid JSON array with this structure:
[
  {
    "title": "Short actionable title",
    "description": "Detailed explanation (2-3 sentences)",
    "impact": "Expected cost/CO2 savings",
    "priority": "high" | "medium" | "low"
  }
]`;
}

type LocalAIProvider = 'webllm' | 'transformers' | 'onnx' | 'heuristic';

const SUPPORTED_LOCAL_PROVIDERS = new Set<AIProvider>([
  'webllm',
  'transformers',
  'onnx',
  'heuristic',
]);

function resolveLocalProvider(mode: ReturnType<typeof getAIMode>): LocalAIProvider {
  if (mode === 'eco') return 'heuristic';
  const preferred = getPreferredLocalModel();
  return SUPPORTED_LOCAL_PROVIDERS.has(preferred) ? (preferred as LocalAIProvider) : 'heuristic';
}

function runInference({
  mode,
  prefersLocal,
  hasProvider,
  prompt,
  llmWorker,
}: {
  mode: ReturnType<typeof getAIMode>;
  prefersLocal: boolean;
  hasProvider: boolean | null;
  prompt: string;
  llmWorker: Remote<LLMWorkerAPI> | null;
}) {
  if (prefersLocal) {
    if (!llmWorker) {
      throw new Error('NO_PROVIDER');
    }
    return llmWorker.generate({
      task: prompt,
      provider: resolveLocalProvider(mode),
    });
  }
  if (hasProvider === null || hasProvider === false) {
    throw new Error('NO_PROVIDER');
  }
  return callAI({ prompt });
}

function isValidRecommendation(item: unknown): item is AIRecommendation {
  if (typeof item !== 'object' || item === null) return false;
  const rec = item as Record<string, unknown>;
  const required = ['title', 'description', 'impact'] as const;
  if (!required.every((key) => typeof rec[key] === 'string')) return false;
  const priority = rec.priority;
  return typeof priority === 'string' && VALID_PRIORITIES.has(priority);
}

function parseRecommendations(text: string): AIRecommendation[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every(isValidRecommendation) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fall through to single recommendation
  }
  return [
    {
      title: 'AI Optimization',
      description: text,
      impact: 'Potential cost savings',
      priority: 'medium',
    },
  ];
}

function handleOptimizationError(
  err: unknown,
  setError: (msg: string) => void,
  setHasProvider: (has: boolean) => void,
  t: TFunction,
) {
  const msg = err instanceof Error ? err.message : 'Optimization failed';
  if (msg === 'NO_PROVIDER' || msg === 'KEY_EXPIRED') {
    setError(t('aiSettings.noKeys', 'No API keys configured yet. Add a provider below.'));
    setHasProvider(false);
  } else {
    setError(msg);
  }
}

function getSeverityStyles(severity: string) {
  switch (severity) {
    case 'positive':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'warning':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
    case 'critical':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    default:
      return 'border-(--color-border) bg-(--color-surface)/50 text-(--color-text)';
  }
}

function getPriorityStyles(priority: string) {
  switch (priority) {
    case 'high':
      return 'border-red-500/30 bg-red-500/5';
    case 'medium':
      return 'border-orange-500/30 bg-orange-500/5';
    case 'low':
      return 'border-blue-500/30 bg-blue-500/5';
    default:
      return 'border-(--color-border) bg-(--color-surface)/50';
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'high':
      return 'bg-red-500/20 text-red-400';
    case 'medium':
      return 'bg-orange-500/20 text-orange-400';
    case 'low':
      return 'bg-blue-500/20 text-blue-400';
    default:
      return 'bg-(--color-muted)/20 text-(--color-muted)';
  }
}
