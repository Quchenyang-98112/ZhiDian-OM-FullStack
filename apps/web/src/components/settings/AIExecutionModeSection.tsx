/**
 * AI execution mode and local model selection.
 */

import type { AIExecutionMode, AIProvider } from '@nexus-hems/ai-core';
import { detectCapabilities } from '@nexus-hems/ai-core';
import { Cpu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAIMode,
  getPreferredLocalModel,
  setAIMode,
  setPreferredLocalModel,
} from '../../core/aiClient';
import { ChoiceCardGroup } from '../ui/ChoiceCardGroup';

const MODES: { value: AIExecutionMode; labelKey: string; descriptionKey: string }[] = [
  {
    value: 'hybrid',
    labelKey: 'aiSettings.modeHybrid',
    descriptionKey: 'aiSettings.modeHybridDesc',
  },
  {
    value: 'local',
    labelKey: 'aiSettings.modeLocal',
    descriptionKey: 'aiSettings.modeLocalDesc',
  },
  {
    value: 'cloud',
    labelKey: 'aiSettings.modeCloud',
    descriptionKey: 'aiSettings.modeCloudDesc',
  },
  {
    value: 'eco',
    labelKey: 'aiSettings.modeEco',
    descriptionKey: 'aiSettings.modeEcoDesc',
  },
];

const LOCAL_MODELS: { value: AIProvider; labelKey: string; requires?: 'webgpu' | 'wasm' }[] = [
  { value: 'webllm', labelKey: 'aiSettings.modelWebllm', requires: 'webgpu' },
  { value: 'transformers', labelKey: 'aiSettings.modelTransformers', requires: 'wasm' },
  { value: 'onnx', labelKey: 'aiSettings.modelOnnx', requires: 'wasm' },
  { value: 'heuristic', labelKey: 'aiSettings.modelHeuristic' },
];

function isModelAvailable(
  model: (typeof LOCAL_MODELS)[number],
  capability: { webgpu: boolean; wasm: boolean },
) {
  if (model.requires === 'webgpu') return capability.webgpu;
  if (model.requires === 'wasm') return capability.wasm;
  return true;
}

function resolvePreferredModel(preferred: AIProvider, available: AIProvider[]): AIProvider {
  if (available.includes(preferred)) return preferred;
  return available[0] ?? 'heuristic';
}

export function AIExecutionModeSection() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AIExecutionMode>(getAIMode());
  const [localModel, setLocalModel] = useState<AIProvider>(() => getPreferredLocalModel());
  const [isDetecting, setIsDetecting] = useState(true);
  const [capability, setCapability] = useState<{ webgpu: boolean; wasm: boolean }>({
    webgpu: false,
    wasm: false,
  });

  useEffect(() => {
    let mounted = true;
    const preferred = getPreferredLocalModel();
    const detect = async () => {
      const caps = await detectCapabilities();
      if (!mounted) return;
      const nextCapability = { webgpu: caps.webgpu, wasm: caps.webAssembly };
      setCapability(nextCapability);
      const available = LOCAL_MODELS.filter((m) => isModelAvailable(m, nextCapability)).map(
        (m) => m.value,
      );
      const reconciled = resolvePreferredModel(preferred, available);
      setLocalModel(reconciled);
      setPreferredLocalModel(reconciled);
      setIsDetecting(false);
    };
    detect().catch((err) => {
      console.error('Failed to detect AI capabilities', err);
      setIsDetecting(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleModeChange = (value: string) => {
    const next = value as AIExecutionMode;
    setMode(next);
    setAIMode(next);
  };

  const handleModelChange = (value: string) => {
    const next = value as AIProvider;
    setLocalModel(next);
    setPreferredLocalModel(next);
  };

  const availableLocalModels = LOCAL_MODELS.filter((m) => isModelAvailable(m, capability));

  return (
    <section className="glass-panel-strong mb-6 p-6">
      <h2 className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <Cpu className="h-5 w-5 text-(--color-secondary)" aria-hidden="true" />
        {t('aiSettings.executionMode')}
      </h2>

      <p className="mb-4 text-(--color-muted) text-sm">{t('aiSettings.executionModeDesc')}</p>

      <ChoiceCardGroup
        name="ai-execution-mode"
        value={mode}
        onChange={handleModeChange}
        aria-label={t('aiSettings.executionMode')}
        options={MODES.map((m) => ({
          value: m.value,
          label: t(m.labelKey),
          description: t(m.descriptionKey),
          tone: m.value === 'eco' ? 'primary' : 'neutral',
        }))}
      />

      {mode !== 'cloud' && (
        <div className="mt-6">
          <h3 className="mb-2 font-medium text-(--color-text)">{t('aiSettings.localModel')}</h3>
          <p className="mb-3 text-(--color-muted) text-sm">{t('aiSettings.localModelDesc')}</p>

          {isDetecting ? (
            <p className="text-(--color-muted) text-sm">{t('aiSettings.modelLoading')}</p>
          ) : (
            <ChoiceCardGroup
              name="ai-local-model"
              value={localModel}
              onChange={handleModelChange}
              aria-label={t('aiSettings.localModel')}
              size="compact"
              options={availableLocalModels.map((m) => ({
                value: m.value,
                label: t(m.labelKey),
                tone: 'primary' as const,
              }))}
            />
          )}
        </div>
      )}
    </section>
  );
}
