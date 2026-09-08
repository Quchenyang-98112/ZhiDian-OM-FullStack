import {
  Activity,
  AlertTriangle,
  Eye,
  Lock,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PageHeader } from '../components/layout/PageHeader';
import { Disclosure } from '../components/ui/Disclosure';
import { EmptyState } from '../components/ui/EmptyState';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';
import { TabSkeleton } from '../components/ui/Skeleton';
import { useEnergyStore } from '../core/useEnergyStore';
import { isBackendWsEnabled } from '../lib/adapter-mode';
import { useAppStoreShallow } from '../store';

// ─── Lazy-load the full monitoring panel ─────────────────────────────
const MonitoringPage = lazy(() => import('./MonitoringPage'));

// ─── Unified Monitoring & Health Page ────────────────────────────────

function MonitoringUnifiedComponent() {
  const { t } = useTranslation();
  const { connected, debugMode, updateSettings } = useAppStoreShallow((s) => ({
    connected: s.connected,
    debugMode: s.settings.debugMode ?? false,
    updateSettings: s.updateSettings,
  }));
  // Opt-in backend WebSocket link state (only meaningful when VITE_BACKEND_WS is on).
  const serverWsConnected = useEnergyStore((s) => s.serverWsConnected);
  // Power User Mode is a single source of truth backed by settings.debugMode, so the
  // toggle persists and stays in sync with the Advanced settings tab (no local desync).
  const powerUserMode = debugMode;
  const setPowerUserMode = (enabled: boolean) => updateSettings({ debugMode: enabled });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('monitoringUnified.title')}
        subtitle={t('monitoringUnified.subtitle')}
        icon={<Eye size={22} aria-hidden="true" />}
        actions={<HeaderConnectionStatus connected={connected} />}
      />

      <SystemStatusBanner connected={connected} serverWsConnected={serverWsConnected} />

      <PowerUserToggle powerUserMode={powerUserMode} onChange={setPowerUserMode} />

      {!powerUserMode && <SummaryCards connected={connected} />}

      {/* ─── Full Monitoring Panel (power user mode) ───────────────── */}
      <AnimatePresence>
        {powerUserMode && (
          <motion.div
            key="monitoring-full"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/*
              The ErrorBoundary is defense-in-depth. The panel's actual crash was
              a Zustand useShallow loop (React #185), fixed in MonitoringPage by
              selecting the stable store ref. Any future panel error should still
              degrade to a recoverable fallback rather than tear down the whole
              /monitoring route (the router-level boundary would blank everything).
            */}
            <ErrorBoundary
              fallback={<MonitoringPanelFallback t={t} onSummary={() => setPowerUserMode(false)} />}
            >
              <Suspense fallback={<TabSkeleton />}>
                <MonitoringPage embedded />
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Invite to enable power user mode ──────────────────────── */}
      {!powerUserMode && (
        <EmptyState
          icon={Eye}
          title={t('monitoringUnified.enableHint')}
          description={t(
            'tour.monitoring.emptyDesc',
            'Aktiviere den Power-User-Modus, um Prometheus-Metriken, Adapter-Status und Ereignislogs einzusehen.',
          )}
          pulse
          action={
            <button
              type="button"
              onClick={() => setPowerUserMode(true)}
              className="focus-ring rounded-xl bg-(--color-primary)/15 px-4 py-2 font-medium text-(--color-primary) text-sm transition-colors hover:bg-(--color-primary)/25"
            >
              {t('monitoringUnified.enableButton')}
            </button>
          }
        />
      )}

      <PageCrossLinks />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function HeaderConnectionStatus({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider ${
          connected
            ? 'bg-(--state-success-bg)/15 text-(--state-success-fg)'
            : 'bg-(--state-danger-bg)/15 text-(--state-danger-fg)'
        }`}
      >
        <span
          className={`energy-pulse h-1.5 w-1.5 rounded-full ${connected ? 'bg-(--state-success-fg)' : 'bg-(--state-danger-fg)'}`}
        />
        {connected ? t('common.connected') : t('common.disconnected')}
      </span>
    </div>
  );
}

function StatusBadgeIcon({ connected }: { connected: boolean }) {
  const wrapper = 'flex h-12 w-12 items-center justify-center rounded-2xl';
  return connected ? (
    <div className={`${wrapper} bg-(--state-success-bg)/15`}>
      <ShieldCheck size={24} className="text-(--state-success-fg)" />
    </div>
  ) : (
    <div className={`${wrapper} bg-(--state-danger-bg)/15`}>
      <ShieldAlert size={24} className="text-(--state-danger-fg)" />
    </div>
  );
}

function SystemStatusHeadline({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <StatusBadgeIcon connected={connected} />
      <div>
        <h2 className="font-medium text-(--color-text) text-lg">
          {connected ? t('monitoringUnified.systemHealthy') : t('monitoringUnified.systemDegraded')}
        </h2>
        <p className="text-(--color-muted) text-xs">{t('monitoringUnified.statusHint')}</p>
      </div>
    </div>
  );
}

function SystemStatusBanner({
  connected,
  serverWsConnected,
}: {
  connected: boolean;
  serverWsConnected: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel-strong hover-lift p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SystemStatusHeadline connected={connected} />

        <div className="flex flex-wrap gap-2">
          <StatusPill label={t('monitoringUnified.protocolMqtt')} ok={connected} />
          <StatusPill label={t('monitoringUnified.protocolKnx')} ok />
          <StatusPill label={t('monitoringUnified.protocolOcpp')} ok />
          <StatusPill label={t('monitoringUnified.protocolEebus')} ok />
          {isBackendWsEnabled() && (
            <StatusPill label={t('monitoringUnified.backendWs')} ok={serverWsConnected} />
          )}
        </div>
      </div>
    </motion.section>
  );
}

function PowerUserSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
}) {
  return (
    <label htmlFor="power-user-toggle" className="relative inline-flex cursor-pointer items-center">
      <input
        id="power-user-toggle"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="sr-only">{label}</span>
      <div className="h-6 w-11 rounded-full border border-(--color-border) bg-(--color-surface) transition-colors duration-300 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-300 peer-checked:bg-(--color-primary) peer-checked:after:translate-x-5 peer-focus:ring-(--color-primary)/30 peer-focus:ring-2" />
    </label>
  );
}

function PowerUserToggle({
  powerUserMode,
  onChange,
}: {
  powerUserMode: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="glass-panel rounded-2xl p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Disclosure
        variant="nested"
        className="border-0 bg-transparent shadow-none"
        title={t('monitoringUnified.powerUserMode')}
        subtitle={t('monitoringUnified.powerUserModeHint')}
        icon={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--color-primary)/10">
            <Server size={20} className="text-(--color-primary)" />
          </div>
        }
        actions={
          <PowerUserSwitch
            checked={powerUserMode}
            onChange={onChange}
            label={t('monitoringUnified.powerUserMode')}
          />
        }
      >
        {!powerUserMode && (
          <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/5 p-3 text-(--color-muted) text-xs">
            <span className="font-medium text-(--color-primary)" aria-hidden="true">
              💡{' '}
            </span>
            {t('monitoringUnified.powerUserHint')}
          </div>
        )}
      </Disclosure>
    </motion.div>
  );
}

function SummaryCards({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <SummaryCard
        icon={<Wifi size={18} className="text-(--state-success-fg)" />}
        label={t('monitoringUnified.adaptersOnline')}
        value={connected ? '5/5' : '0/5'}
        status={connected ? 'ok' : 'crit'}
      />
      <SummaryCard
        icon={<Activity size={18} className="text-blue-400" />}
        label={t('monitoringUnified.prometheusStatus')}
        value={t('common.active')}
        status="ok"
      />
      <SummaryCard
        icon={<Server size={18} className="text-purple-400" />}
        label={t('monitoringUnified.systemLoad')}
        value="23%"
        status="ok"
      />
      <SummaryCard
        icon={<Lock size={18} className="text-cyan-400" />}
        label={t('monitoringUnified.security')}
        value={t('monitoringUnified.securityOk')}
        status="ok"
      />
    </motion.div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-[10px] ${
        ok
          ? 'bg-(--state-success-bg)/10 text-(--state-success-fg)'
          : 'bg-(--state-danger-bg)/10 text-(--state-danger-fg)'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-(--state-success-fg)' : 'bg-(--state-danger-fg)'}`}
      />
      {label}
    </span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'ok' | 'warn' | 'crit';
}) {
  const dot =
    status === 'crit'
      ? 'bg-(--state-danger-fg)'
      : status === 'warn'
        ? 'bg-(--state-warning-fg)'
        : 'bg-(--state-success-fg)';

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
          {icon}
        </span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${dot} ${status !== 'ok' ? 'energy-pulse' : ''}`}
        />
      </div>
      <p className="font-medium text-(--color-text) text-lg">{value}</p>
      <p className="mt-0.5 text-(--color-muted) text-[10px]">{label}</p>
    </div>
  );
}

/**
 * Panel-sized fallback shown if the lazy MonitoringPage subtree throws. Unlike
 * the default full-screen ErrorBoundary UI, this keeps the summary + toggle
 * intact and offers a recoverable path (back to summary, or reload for a stale
 * chunk after a deploy).
 */
function MonitoringPanelFallbackActions({
  t,
  onSummary,
}: {
  t: (key: string) => string;
  onSummary: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onSummary}
        className="focus-ring rounded-xl bg-(--color-primary)/15 px-4 py-2 font-medium text-(--color-primary) text-sm transition-colors hover:bg-(--color-primary)/25"
      >
        {t('monitoringUnified.panelErrorSummary')}
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="focus-ring rounded-xl border border-(--color-border) px-4 py-2 font-medium text-(--color-text) text-sm transition-colors hover:bg-(--color-surface)"
      >
        {t('monitoringUnified.panelErrorReload')}
      </button>
    </div>
  );
}

function MonitoringPanelFallback({
  t,
  onSummary,
}: {
  t: (key: string) => string;
  onSummary: () => void;
}) {
  return (
    <section
      className="glass-panel-strong flex items-start gap-3 p-6"
      role="alert"
      aria-live="assertive"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--state-danger-bg)/15">
        <AlertTriangle size={20} className="text-(--state-danger-fg)" aria-hidden="true" />
      </span>
      <div className="flex-1">
        <h2 className="font-medium text-(--color-text) text-lg">
          {t('monitoringUnified.panelErrorTitle')}
        </h2>
        <p className="mt-1 text-(--color-muted) text-sm">{t('monitoringUnified.panelErrorDesc')}</p>
        <MonitoringPanelFallbackActions t={t} onSummary={onSummary} />
      </div>
    </section>
  );
}

export default MonitoringUnifiedComponent;
