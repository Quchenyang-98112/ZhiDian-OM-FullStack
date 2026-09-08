import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Layers,
  Link2,
  Package,
  Play,
  Puzzle,
  Square,
  Store,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { BrowseAdaptersPanel } from '../components/plugins/BrowseAdaptersPanel';
import { Disclosure } from '../components/ui/Disclosure';
import { NeonCard, NeonCardBody } from '../components/ui/NeonCard';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';
import { type PluginEntry, type PluginState, pluginManager } from '../core/plugin-system';

// ─── Tab bar ────────────────────────────────────────────────────────

type PluginTab = 'installed' | 'browse';

function TabBar({ active, onChange }: { active: PluginTab; onChange: (t: PluginTab) => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex gap-1 rounded-2xl border border-(--color-border) bg-white/[0.02] p-1"
      role="tablist"
      aria-label={t('plugins.tabsLabel')}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === 'installed'}
        onClick={() => onChange('installed')}
        className={`focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 font-medium text-sm transition-colors ${
          active === 'installed'
            ? 'bg-(--color-primary)/15 text-(--color-primary)'
            : 'text-(--color-muted) hover:text-(--color-text)'
        }`}
      >
        <Puzzle className="h-4 w-4" aria-hidden="true" />
        {t('plugins.tabInstalled')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'browse'}
        onClick={() => onChange('browse')}
        className={`focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 font-medium text-sm transition-colors ${
          active === 'browse'
            ? 'bg-(--color-primary)/15 text-(--color-primary)'
            : 'text-(--color-muted) hover:text-(--color-text)'
        }`}
      >
        <Store className="h-4 w-4" aria-hidden="true" />
        {t('plugins.tabBrowse')}
      </button>
    </div>
  );
}

// ─── State badge colors ─────────────────────────────────────────────

const STATE_STYLES: Record<PluginState, { color: string; Icon: typeof CheckCircle2 }> = {
  installed: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', Icon: Package },
  resolved: { color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', Icon: Link2 },
  starting: { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', Icon: Clock },
  active: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', Icon: CheckCircle2 },
  stopping: { color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', Icon: Clock },
  uninstalled: {
    color: 'text-(--color-muted) bg-(--color-muted)/10 border-(--color-muted)/30',
    Icon: XCircle,
  },
};

const STATE_I18N: Record<PluginState, string> = {
  installed: 'plugins.installed',
  resolved: 'plugins.resolved',
  starting: 'plugins.starting',
  active: 'plugins.running',
  stopping: 'plugins.stopping',
  uninstalled: 'plugins.uninstalled',
};

// ─── Category badge ─────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  adapter: 'text-purple-400 bg-purple-500/10',
  controller: 'text-orange-400 bg-orange-500/10',
  analytics: 'text-blue-400 bg-blue-500/10',
  ui: 'text-pink-400 bg-pink-500/10',
  integration: 'text-cyan-400 bg-cyan-500/10',
};

// ─── Overview Card ──────────────────────────────────────────────────

function PluginOverviewCard({ entries }: { entries: PluginEntry[] }) {
  const { t } = useTranslation();
  const active = entries.filter((e) => e.state === 'active').length;
  const total = entries.length;
  const services = pluginManager.listServices();

  return (
    <NeonCard variant="primary" glow>
      <NeonCardBody>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-primary)/10">
              <Puzzle className="h-6 w-6 text-(--color-primary)" />
            </div>
            <div>
              <h2 className="fluid-text-lg font-semibold">{t('plugins.title')}</h2>
              <p className="fluid-text-sm text-(--color-muted)">
                {active}/{total} {t('plugins.running')}
                {services.length > 0 && (
                  <span className="ml-2">
                    • {services.length} {t('plugins.services')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="fluid-text-2xl font-bold font-mono text-(--color-primary)">
                {total}
              </span>
              <p className="fluid-text-xs text-(--color-muted)">{t('plugins.installed')}</p>
            </div>
          </div>
        </div>
      </NeonCardBody>
    </NeonCard>
  );
}

// ─── Plugin Card ────────────────────────────────────────────────────

function PluginCard({
  entry,
  onStart,
  onStop,
  onUninstall,
}: {
  entry: PluginEntry;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { plugin, state, installedAt, activatedAt, error } = entry;
  const descriptor = plugin.descriptor;
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.installed;
  const StateIcon = stateStyle.Icon;
  const categoryColor =
    CATEGORY_COLORS[descriptor.category ?? 'integration'] ?? CATEGORY_COLORS.integration;

  return (
    <NeonCard
      variant={error ? 'warning' : 'default'}
      hover={false}
      className={state === 'uninstalled' ? 'opacity-50' : ''}
    >
      <NeonCardBody className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/10">
              <Puzzle className="h-5 w-5 text-(--color-primary)" />
            </div>
            <div>
              <h3 className="fluid-text-base font-semibold">{descriptor.name}</h3>
              <div className="fluid-text-xs flex items-center gap-2 text-(--color-muted)">
                <span className="font-mono">v{descriptor.version}</span>
                {descriptor.category && (
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${categoryColor}`}
                  >
                    {descriptor.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* State badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-wider ${stateStyle.color}`}
            >
              <StateIcon className="h-3 w-3" />
              {t(STATE_I18N[state] ?? 'plugins.installed')}
            </span>
          </div>
        </div>

        {/* Description */}
        {descriptor.description && (
          <p className="fluid-text-sm text-(--color-muted)">{descriptor.description}</p>
        )}

        {/* Error */}
        {error && (
          <div className="fluid-text-xs flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {state === 'installed' || state === 'resolved' ? (
            <button
              type="button"
              onClick={() => onStart(descriptor.id)}
              className="focus-ring flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-400 text-sm transition-colors hover:bg-emerald-500/20"
            >
              <Play className="h-3.5 w-3.5" />
              {t('plugins.start')}
            </button>
          ) : state === 'active' ? (
            <button
              type="button"
              onClick={() => onStop(descriptor.id)}
              className="focus-ring flex items-center gap-1.5 rounded-xl bg-orange-500/10 px-3 py-1.5 font-medium text-orange-400 text-sm transition-colors hover:bg-orange-500/20"
            >
              <Square className="h-3.5 w-3.5" />
              {t('plugins.stop')}
            </button>
          ) : null}

          {state !== 'active' && state !== 'uninstalled' && (
            <button
              type="button"
              onClick={() => onUninstall(descriptor.id)}
              className="focus-ring flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 font-medium text-red-400 text-sm transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('plugins.uninstall')}
            </button>
          )}
        </div>

        <Disclosure variant="nested" title={t('plugins.metadata')} defaultOpen={false}>
          <div className="space-y-3">
            {descriptor.author && (
              <div className="fluid-text-sm flex justify-between">
                <span className="text-(--color-muted)">{t('plugins.author')}</span>
                <span>{descriptor.author}</span>
              </div>
            )}
            <div className="fluid-text-sm flex justify-between">
              <span className="text-(--color-muted)">{t('plugins.installed')}</span>
              <span>{new Date(installedAt).toLocaleString()}</span>
            </div>
            {activatedAt && (
              <div className="fluid-text-sm flex justify-between">
                <span className="text-(--color-muted)">{t('plugins.lastActivated')}</span>
                <span>{new Date(activatedAt).toLocaleString()}</span>
              </div>
            )}
            {descriptor.provides && descriptor.provides.length > 0 && (
              <div>
                <span className="fluid-text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                  {t('plugins.providesServices')}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {descriptor.provides.map((svc) => (
                    <span
                      key={svc}
                      className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-(--color-muted) text-[10px]"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {descriptor.dependencies && Object.keys(descriptor.dependencies).length > 0 && (
              <div>
                <span className="fluid-text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                  {t('plugins.dependencies')}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(descriptor.dependencies).map(([depId, ver]) => (
                    <span
                      key={depId}
                      className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-(--color-muted) text-[10px]"
                    >
                      {depId}@{ver}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Disclosure>
      </NeonCardBody>
    </NeonCard>
  );
}

// ─── Empty State ────────────────────────────────────────────────────

function EmptyPluginState() {
  const { t } = useTranslation();
  return (
    <NeonCard variant="default">
      <NeonCardBody className="py-12 text-center">
        <Layers className="mx-auto mb-4 h-12 w-12 text-(--color-muted)" />
        <h3 className="fluid-text-lg mb-2 font-semibold">{t('plugins.noPlugins')}</h3>
        <p className="fluid-text-sm mx-auto max-w-md text-(--color-muted)">
          {t('plugins.noPluginsDescription')}
        </p>
      </NeonCardBody>
    </NeonCard>
  );
}

// ─── Services List ──────────────────────────────────────────────────

function ServicesList() {
  const { t } = useTranslation();
  const services = pluginManager.listServices();

  if (services.length === 0) return null;

  return (
    <NeonCard variant="default">
      <NeonCardBody>
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-(--color-primary)" />
          <h3 className="fluid-text-base font-semibold">{t('plugins.serviceRegistry')}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {services.map((svc) => (
            <span
              key={svc}
              className="inline-flex items-center gap-1.5 rounded-xl border border-(--color-border) bg-white/[0.02] px-3 py-1.5 font-mono text-sm"
            >
              <Link2 className="h-3.5 w-3.5 text-(--color-primary)" />
              {svc}
            </span>
          ))}
        </div>
      </NeonCardBody>
    </NeonCard>
  );
}

// ─── Page Component ─────────────────────────────────────────────────

function InstalledTab({
  entries,
  onStart,
  onStop,
  onUninstall,
}: {
  entries: PluginEntry[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  return (
    <>
      <PluginOverviewCard entries={entries} />
      <ServicesList />
      {entries.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <PluginCard
              key={entry.plugin.descriptor.id}
              entry={entry}
              onStart={onStart}
              onStop={onStop}
              onUninstall={onUninstall}
            />
          ))}
        </div>
      ) : (
        <EmptyPluginState />
      )}
    </>
  );
}

/**
 * @param embedded When rendered as the "plugins" section inside SettingsUnified,
 *   that wrapper already supplies the page header + cross-links footer; this page
 *   suppresses its own to avoid a duplicate <h1> and duplicate panels. Defaults
 *   to false so the standalone /plugins route keeps full page chrome.
 */
function PluginsPageComponent({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PluginTab>('installed');
  const [entries, setEntries] = useState<PluginEntry[]>(() => pluginManager.list());

  const refresh = () => setEntries(pluginManager.list());

  const handleStart = async (id: string) => {
    await pluginManager.start(id);
    refresh();
  };

  const handleStop = async (id: string) => {
    await pluginManager.stop(id);
    refresh();
  };

  const handleUninstall = async (id: string) => {
    await pluginManager.uninstall(id);
    refresh();
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title={t('plugins.title')}
          subtitle={t('plugins.subtitle')}
          icon={<Puzzle className="h-5 w-5" />}
        />
      )}

      <TabBar active={tab} onChange={setTab} />

      {tab === 'installed' ? (
        <InstalledTab
          entries={entries}
          onStart={handleStart}
          onStop={handleStop}
          onUninstall={handleUninstall}
        />
      ) : (
        <BrowseAdaptersPanel />
      )}

      {!embedded && <PageCrossLinks />}
    </div>
  );
}

export default PluginsPageComponent;
