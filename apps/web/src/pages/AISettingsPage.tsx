/**
 * BYOK AI Settings Page — Manage encrypted API keys for multiple AI providers.
 */

import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Key,
  KeyRound,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AIExecutionModeSection } from '../components/settings/AIExecutionModeSection';
import { ChoiceCardGroup } from '../components/ui/ChoiceCardGroup';
import { EmptyState } from '../components/ui/EmptyState';
import {
  AI_PROVIDERS,
  type AIProvider,
  getActiveProvider,
  listAIKeys,
  removeAIKey,
  saveAIKey,
  setActiveProvider,
  syncActiveAIKeyToBackend,
} from '../lib/ai-keys';

interface StoredKeyInfo {
  provider: AIProvider;
  model: string;
  baseUrl: string;
  createdAt: number;
  lastUsed: number;
}

function isModelRequired(provider: AIProvider): boolean {
  return AI_PROVIDERS[provider].models.length === 0;
}

function isModelMissing(provider: AIProvider, model: string): boolean {
  return isModelRequired(provider) && !model.trim();
}

function isSaveDisabled(
  provider: AIProvider,
  apiKeyInput: string,
  modelInput: string,
  saving: boolean,
): boolean {
  return saving || !apiKeyInput.trim() || isModelMissing(provider, modelInput);
}

export default function AISettingsPage() {
  const { t } = useTranslation();
  const [storedKeys, setStoredKeys] = useState<StoredKeyInfo[]>([]);
  const [activeProvider, setActive] = useState<AIProvider | null>(null);
  const [addingProvider, setAddingProvider] = useState<AIProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setApiKeyInput('');
    setModelInput('');
    setCustomUrlInput('');
    setAddingProvider(null);
  };

  const refreshKeys = async () => {
    const keys = await listAIKeys();
    setStoredKeys(keys);
    const active = await getActiveProvider();
    setActive(active);
  };

  const saveKeyAndActivate = async (provider: AIProvider, baseUrl: string | undefined) => {
    const model = modelInput.trim() || AI_PROVIDERS[provider].models[0] || '';
    await saveAIKey(provider, apiKeyInput.trim(), model, baseUrl);
    if (storedKeys.length === 0) setActiveProvider(provider);
    await syncActiveAIKeyToBackend(provider);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const keys = await listAIKeys();
      if (!mounted) return;
      setStoredKeys(keys);
      const active = await getActiveProvider();
      if (!mounted) return;
      setActive(active);
    };
    load().catch((err) => {
      console.error('Failed to load AI keys', err);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const commitSave = async () => {
    const provider = addingProvider;
    if (!provider) return;
    const baseUrl = provider === 'custom' || provider === 'ollama' ? customUrlInput : undefined;
    await saveKeyAndActivate(provider, baseUrl);
    resetForm();
    toast.success(t('aiSettings.saved', 'Key encrypted & saved'));
    await refreshKeys();
  };

  const canSaveProvider = (provider: AIProvider): boolean => {
    if (!apiKeyInput.trim()) return false;
    if (isModelMissing(provider, modelInput)) {
      toast.error(t('aiSettings.modelRequired'));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!addingProvider || !canSaveProvider(addingProvider)) return;
    setSaving(true);

    try {
      await commitSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (provider: AIProvider) => {
    await removeAIKey(provider);
    if (activeProvider === provider) {
      setActive(null);
      localStorage.removeItem('nexus-hems-ai-provider');
    }
    await refreshKeys();
  };

  const handleSetActive = (provider: AIProvider) => {
    setActiveProvider(provider);
    setActive(provider);
    void syncActiveAIKeyToBackend(provider);
  };

  const startAdding = (provider: AIProvider) => {
    setAddingProvider(provider);
    setModelInput(AI_PROVIDERS[provider].models[0] || '');
    setCustomUrlInput(AI_PROVIDERS[provider].baseUrl);
  };

  return (
    <motion.div
      className="mx-auto max-w-4xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <PageHeader />
      <AIExecutionModeSection />
      <SecurityNotice />
      <StoredKeysSection
        storedKeys={storedKeys}
        activeProvider={activeProvider}
        onSetActive={handleSetActive}
        onRemove={handleRemove}
      />
      <AddProviderSection
        addingProvider={addingProvider}
        storedKeys={storedKeys}
        apiKeyInput={apiKeyInput}
        modelInput={modelInput}
        customUrlInput={customUrlInput}
        showKey={showKey}
        saving={saving}
        onStartAdding={startAdding}
        onCancel={resetForm}
        onSave={handleSave}
        onApiKeyChange={setApiKeyInput}
        onModelChange={setModelInput}
        onCustomUrlChange={setCustomUrlInput}
        onToggleShowKey={() => setShowKey((s) => !s)}
      />
    </motion.div>
  );
}

function PageHeader() {
  const { t } = useTranslation();
  return (
    <motion.div
      className="mb-8 flex items-center gap-3"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <motion.div
        animate={{ rotate: [0, 15, -15, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Key className="text-(--color-primary)" size={28} />
      </motion.div>
      <div>
        <h1 className="fluid-text-4xl font-light text-3xl tracking-tight">
          {t('aiSettings.title', 'AI Provider Keys')}
        </h1>
        <p className="mt-1 text-(--color-muted) text-sm">
          {t('aiSettings.subtitle', 'Bring Your Own Key — encrypted with AES-GCM 256-bit')}
        </p>
      </div>
    </motion.div>
  );
}

function SecurityNotice() {
  const { t } = useTranslation();
  return (
    <motion.div
      className="glass-panel mb-6 flex items-start gap-3 p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Shield className="mt-0.5 h-5 w-5 shrink-0 text-(--color-primary)" />
      <div className="text-(--color-muted) text-sm">
        <p className="font-medium text-(--color-text)">
          {t('aiSettings.securityTitle', 'End-to-End Encrypted')}
        </p>
        <p className="mt-1">
          {t(
            'aiSettings.securityDesc',
            'Keys are encrypted with PBKDF2 + AES-GCM 256-bit before storage in IndexedDB. Keys are never sent to our servers — only directly to the AI provider you choose.',
          )}
        </p>
      </div>
    </motion.div>
  );
}

function StoredKeysSection({
  storedKeys,
  activeProvider,
  onSetActive,
  onRemove,
}: {
  storedKeys: StoredKeyInfo[];
  activeProvider: AIProvider | null;
  onSetActive: (provider: AIProvider) => void;
  onRemove: (provider: AIProvider) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong mb-6 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <h2 className="fluid-text-lg mb-4 flex items-center gap-2 font-medium">
        <Sparkles className="h-5 w-5 text-(--color-secondary)" />
        {t('aiSettings.configured', 'Configured Providers')}
      </h2>

      {storedKeys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('aiSettings.noKeys', 'No API keys configured yet.')}
          description={t(
            'aiSettings.noKeysDesc',
            'Add a provider below to get started with AI-powered energy optimization.',
          )}
        />
      ) : (
        <div className="space-y-3">
          {storedKeys.map((key) => (
            <StoredKeyCard
              key={key.provider}
              keyInfo={key}
              isActive={activeProvider === key.provider}
              onSetActive={onSetActive}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </motion.section>
  );
}

function StoredKeyCard({
  keyInfo,
  isActive,
  onSetActive,
  onRemove,
}: {
  keyInfo: StoredKeyInfo;
  isActive: boolean;
  onSetActive: (provider: AIProvider) => void;
  onRemove: (provider: AIProvider) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        isActive
          ? 'border-(--color-primary)/40 bg-(--color-primary)/5'
          : 'border-(--color-border) bg-(--color-surface)'
      }`}
      layout
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-surface-strong)">
          <Key className="h-5 w-5 text-(--color-primary)" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-(--color-text)">
            {AI_PROVIDERS[keyInfo.provider]?.label ?? keyInfo.provider}
          </p>
          <p className="truncate text-(--color-muted) text-xs">
            {keyInfo.model} · {t('aiSettings.lastUsed', 'Last used')}{' '}
            {new Date(keyInfo.lastUsed).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {!isActive && (
          <button
            type="button"
            onClick={() => onSetActive(keyInfo.provider)}
            className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-xs active:scale-[0.95]"
          >
            {t('aiSettings.setActive', 'Set Active')}
          </button>
        )}
        {isActive && (
          <span className="rounded-full bg-(--color-primary)/20 px-3 py-1 font-medium text-(--color-primary) text-xs">
            {t('common.active')}
          </span>
        )}
        <button
          type="button"
          onClick={() => onRemove(keyInfo.provider)}
          className="focus-ring rounded-full p-2 text-red-400 transition-colors hover:bg-red-500/10 active:scale-[0.9]"
          aria-label={t('aiSettings.remove', 'Remove key')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function AddProviderSection({
  addingProvider,
  storedKeys,
  apiKeyInput,
  modelInput,
  customUrlInput,
  showKey,
  saving,
  onStartAdding,
  onCancel,
  onSave,
  onApiKeyChange,
  onModelChange,
  onCustomUrlChange,
  onToggleShowKey,
}: {
  addingProvider: AIProvider | null;
  storedKeys: StoredKeyInfo[];
  apiKeyInput: string;
  modelInput: string;
  customUrlInput: string;
  showKey: boolean;
  saving: boolean;
  onStartAdding: (provider: AIProvider) => void;
  onCancel: () => void;
  onSave: () => void;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  onToggleShowKey: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <h2 className="fluid-text-lg mb-4 font-medium">
        {t('aiSettings.addProvider', 'Add Provider')}
      </h2>

      {!addingProvider ? (
        <ProviderGrid storedKeys={storedKeys} onSelect={onStartAdding} />
      ) : (
        <KeyInputForm
          provider={addingProvider}
          apiKeyInput={apiKeyInput}
          modelInput={modelInput}
          customUrlInput={customUrlInput}
          showKey={showKey}
          saving={saving}
          onCancel={onCancel}
          onSave={onSave}
          onApiKeyChange={onApiKeyChange}
          onModelChange={onModelChange}
          onCustomUrlChange={onCustomUrlChange}
          onToggleShowKey={onToggleShowKey}
        />
      )}
    </motion.section>
  );
}

function ProviderGrid({
  storedKeys,
  onSelect,
}: {
  storedKeys: StoredKeyInfo[];
  onSelect: (provider: AIProvider) => void;
}) {
  const providers = Object.values(AI_PROVIDERS);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {providers.map((p) => {
        const isConfigured = storedKeys.some((k) => k.provider === p.provider);
        return (
          <motion.button
            key={p.provider}
            onClick={() => onSelect(p.provider)}
            disabled={isConfigured}
            className={`focus-ring flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all ${
              isConfigured
                ? 'cursor-not-allowed border-(--color-border) opacity-40'
                : 'border-(--color-border) hover:border-(--color-primary)/40 hover:bg-(--color-primary)/5'
            }`}
            whileHover={isConfigured ? {} : { scale: 1.03 }}
            whileTap={isConfigured ? {} : { scale: 0.97 }}
          >
            <Key className="h-5 w-5 text-(--color-secondary)" />
            <span className="font-medium text-sm">{p.label}</span>
            {isConfigured && <Check className="h-4 w-4 text-(--color-primary)" />}
          </motion.button>
        );
      })}
    </div>
  );
}

function KeyInputForm({
  provider,
  apiKeyInput,
  modelInput,
  customUrlInput,
  showKey,
  saving,
  onCancel,
  onSave,
  onApiKeyChange,
  onModelChange,
  onCustomUrlChange,
  onToggleShowKey,
}: {
  provider: AIProvider;
  apiKeyInput: string;
  modelInput: string;
  customUrlInput: string;
  showKey: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  onToggleShowKey: () => void;
}) {
  const { t } = useTranslation();
  const providerMeta = AI_PROVIDERS[provider];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-(--color-text)">{providerMeta.label}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-(--color-muted) text-sm hover:text-(--color-text)"
        >
          {t('aiSettings.cancel', 'Cancel')}
        </button>
      </div>

      <ByokWarning provider={providerMeta.label} />
      <ApiKeyInput
        value={apiKeyInput}
        showKey={showKey}
        onChange={onApiKeyChange}
        onToggle={onToggleShowKey}
      />
      <ModelInput provider={provider} value={modelInput} onChange={onModelChange} />
      {(provider === 'custom' || provider === 'ollama') && (
        <BaseUrlInput value={customUrlInput} onChange={onCustomUrlChange} />
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={isSaveDisabled(provider, apiKeyInput, modelInput, saving)}
        className="btn-primary focus-ring flex items-center gap-2"
      >
        {saving ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Shield className="h-4 w-4" />
        )}
        {t('aiSettings.encrypt', 'Encrypt & Save')}
      </button>
    </motion.div>
  );
}

function ByokWarning({ provider }: { provider: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
      role="note"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="text-(--color-muted) text-xs">
        <p className="font-medium text-amber-400">
          {t('aiSettings.byokWarningTitle', 'Used directly from this browser')}
        </p>
        <p className="mt-1">
          {t('aiSettings.byokWarningDesc', {
            provider,
            defaultValue:
              'This key is sent straight from your browser to {{provider}} and stored encrypted in this browser only — it never reaches our servers. Anyone with access to this device could use it. Never enter a key on a shared or untrusted device.',
          })}
        </p>
      </div>
    </div>
  );
}

function ApiKeyInput({
  value,
  showKey,
  onChange,
  onToggle,
}: {
  value: string;
  showKey: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <label htmlFor="ai-api-key" className="font-medium text-(--color-muted) text-sm">
        {t('aiSettings.apiKey', 'API 密钥')}
      </label>
      <div className="relative">
        <input
          id="ai-api-key"
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          className="w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 pr-10 text-(--color-text) outline-none transition-colors focus:border-(--color-primary)/50 focus:ring-(--color-primary)/20 focus:ring-2"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-(--color-muted)"
          aria-label={showKey ? t('common.hideKey') : t('common.showKey')}
        >
          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ModelInput({
  provider,
  value,
  onChange,
}: {
  provider: AIProvider;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const models = AI_PROVIDERS[provider].models;
  return (
    <div className="space-y-2">
      <span className="font-medium text-(--color-muted) text-sm" id="ai-model-label">
        {t('aiSettings.model')}
      </span>
      {models.length > 0 ? (
        <ChoiceCardGroup
          key={`${provider}-${value}`}
          name="ai-model"
          value={value}
          onChange={onChange}
          aria-label={t('aiSettings.model')}
          size="compact"
          options={models.map((m) => ({
            value: m,
            label: m,
            tone: 'primary' as const,
          }))}
        />
      ) : (
        <input
          id="ai-model"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="model-name"
          aria-labelledby="ai-model-label"
          className="w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-(--color-text) outline-none transition-colors focus:border-(--color-primary)/50 focus:ring-(--color-primary)/20 focus:ring-2"
        />
      )}
    </div>
  );
}

function BaseUrlInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <label htmlFor="ai-base-url" className="font-medium text-(--color-muted) text-sm">
        Base URL
      </label>
      <input
        id="ai-base-url"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://..."
        className="w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-(--color-text) outline-none transition-colors focus:border-(--color-primary)/50 focus:ring-(--color-primary)/20 focus:ring-2"
      />
    </div>
  );
}
