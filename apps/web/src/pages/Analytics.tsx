import { BarChart3, ChevronRight, Clock, Database, FileText, Leaf, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';
import { TabSkeleton } from '../components/ui/Skeleton';

// ─── Lazy-load heavy sub-pages into tab panels ───────────────────────
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));
const HistoricalAnalyticsPage = lazy(() => import('./HistoricalAnalyticsPage'));

// ─── Tab definitions ─────────────────────────────────────────────────

type AnalyticsTab = 'realtime' | 'historical';

// ─── Unified Analytics & Reports Page ────────────────────────────────

function AnalyticsUnifiedComponent() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('realtime');

  const tabs: { key: AnalyticsTab; icon: React.ReactNode; label: string; desc: string }[] = [
    {
      key: 'realtime',
      icon: <BarChart3 size={18} />,
      label: t('analyticsUnified.realtimeTab'),
      desc: t('analyticsUnified.realtimeDesc'),
    },
    {
      key: 'historical',
      icon: <Database size={18} />,
      label: t('analyticsUnified.historicalTab'),
      desc: t('analyticsUnified.historicalDesc'),
    },
  ];

  // Quick-link cards at top
  const quickLinks = [
    {
      icon: <Leaf size={18} />,
      label: t('analyticsUnified.co2Report'),
      value: t('analyticsUnified.co2ReportHint'),
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      tab: 'realtime' as const,
    },
    {
      icon: <TrendingUp size={18} />,
      label: t('analyticsUnified.mlForecast'),
      value: t('analyticsUnified.mlForecastHint'),
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      tab: 'realtime' as const,
    },
    {
      icon: <Clock size={18} />,
      label: t('analyticsUnified.timeSeries'),
      value: t('analyticsUnified.timeSeriesHint'),
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      tab: 'historical' as const,
    },
    {
      icon: <FileText size={18} />,
      label: t('analyticsUnified.exportPdf'),
      value: t('analyticsUnified.exportPdfHint'),
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      tab: 'realtime' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('analyticsUnified.title')}
        subtitle={t('analyticsUnified.subtitle')}
        icon={<BarChart3 size={22} aria-hidden="true" />}
      />

      {/* ─── Quick-Link Cards ──────────────────────────────────────── */}
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold text-(--color-muted) text-xs uppercase tracking-widest">
          {t('analyticsUnified.quickLinks')}
        </h2>
        <HelpTooltip content={t('tour.analytics.quickHelp')} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickLinks.map((link, i) => (
          <motion.button
            key={link.label}
            onClick={() => setActiveTab(link.tab)}
            className="group glass-panel hover-lift cursor-pointer rounded-2xl p-4 text-left transition-all"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${link.bg} ${link.color}`}
              >
                {link.icon}
              </span>
              <ChevronRight
                size={12}
                className="text-(--color-muted) opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </div>
            <p className="font-medium text-(--color-text) text-xs">{link.label}</p>
            <p className="mt-0.5 text-(--color-muted) text-[10px]">{link.value}</p>
          </motion.button>
        ))}
      </div>

      {/* ─── Tab Selector ──────────────────────────────────────────── */}
      <div
        className="flex gap-2 rounded-xl bg-(--color-surface)/50 p-1"
        role="tablist"
        aria-label={t('analyticsUnified.title')}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            id={`analytics-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium text-sm transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-(--color-primary)/15 text-(--color-primary) shadow-[inset_0_0_0_1px_var(--color-primary)/20]'
                : 'text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Tab Panels ────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'realtime' && (
          <motion.div
            key="realtime"
            role="tabpanel"
            id="tabpanel-realtime"
            aria-labelledby="analytics-tab-realtime"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <Suspense fallback={<TabSkeleton />}>
              <AnalyticsPage embedded />
            </Suspense>
          </motion.div>
        )}

        {activeTab === 'historical' && (
          <motion.div
            key="historical"
            role="tabpanel"
            id="tabpanel-historical"
            aria-labelledby="analytics-tab-historical"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <Suspense fallback={<TabSkeleton />}>
              <HistoricalAnalyticsPage embedded />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <PageCrossLinks />
    </div>
  );
}

export default AnalyticsUnifiedComponent;
