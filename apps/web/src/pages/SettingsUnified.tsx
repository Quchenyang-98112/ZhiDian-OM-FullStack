import {
  Bell,
  Cable,
  ChevronRight,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  HelpCircle,
  Palette,
  Puzzle,
  Server,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';
import { TabSkeleton } from '../components/ui/Skeleton';
import { applySettingsTabParam, resolveSettingsTab } from '../lib/settings-tab-url';
import {
  applySettingsSectionParam,
  resolveSettingsSection,
  type SettingsSection,
} from '../lib/settings-unified-url';

// ─── Lazy-load existing pages ────────────────────────────────────────
const SettingsPage = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })));
const PluginsPage = lazy(() => import('./PluginsPage'));
const HelpPage = lazy(() => import('./Help').then((m) => ({ default: m.Help })));

// ─── Tab definitions ─────────────────────────────────────────────────

// ─── Unified Settings & Plugins Page ─────────────────────────────────

function SettingsUnifiedComponent() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const activeSection = resolveSettingsSection(searchParams.get('section'));

  const handleSectionChange = (section: SettingsSection) => {
    setSearchParams(applySettingsSectionParam(searchParams, section), { replace: true });
  };

  const sections: {
    key: SettingsSection;
    icon: React.ReactNode;
    label: string;
    desc: string;
    badge?: string;
  }[] = [
    {
      key: 'settings',
      icon: <SettingsIcon size={20} />,
      label: t('settingsUnified.configSection'),
      desc: t('settingsUnified.configSectionDesc'),
    },
    {
      key: 'plugins',
      icon: <Puzzle size={20} />,
      label: t('settingsUnified.pluginsSection'),
      desc: t('settingsUnified.pluginsSectionDesc'),
      badge: t('settingsUnified.marketplace'),
    },
    {
      key: 'help',
      icon: <HelpCircle size={20} />,
      label: t('settingsUnified.helpSection'),
      desc: t('settingsUnified.helpSectionDesc'),
    },
  ];

  // Quick-access tiles for the Settings sub-tabs
  const quickTiles: {
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
    tab?: string;
    route?: string;
  }[] = [
    {
      icon: <Palette size={16} />,
      label: t('settings.appearance'),
      tab: 'appearance',
      color: 'text-pink-400',
      bg: 'bg-pink-500/10',
    },
    {
      icon: <Server size={16} />,
      label: t('settings.system'),
      tab: 'system',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      icon: <Zap size={16} />,
      label: t('settings.energyShort'),
      tab: 'energy',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      icon: <Cable size={16} />,
      label: t('adapterConfig.tabLabel'),
      tab: 'adapters',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
    {
      icon: <HardDrive size={16} />,
      label: t('hardwareRegistry.title'),
      route: '/settings/hardware',
      color: 'text-teal-400',
      bg: 'bg-teal-500/10',
    },
    {
      icon: <Cpu size={16} />,
      label: t('settings.controllersTab'),
      tab: 'controllers',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
    {
      icon: <Shield size={16} />,
      label: t('settings.security'),
      tab: 'security',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      icon: <Database size={16} />,
      label: t('settings.storageShort'),
      tab: 'storage',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      icon: <Bell size={16} />,
      label: t('settings.notifications'),
      tab: 'notifications',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      icon: <Gauge size={16} />,
      label: t('settings.advanced'),
      tab: 'advanced',
      color: 'text-(--color-muted)',
      bg: 'bg-(--color-muted)/10',
    },
    {
      icon: <Sparkles size={16} />,
      label: t('settings.aiTab'),
      route: '/settings/ai',
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settingsUnified.title')}
        subtitle={t('settingsUnified.subtitle')}
        icon={<SettingsIcon size={22} aria-hidden="true" />}
      />

      {/* ─── Vertical Accordion Navigation ─────────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Section Accordion */}
        <nav className="w-full shrink-0 lg:w-64" aria-label={t('settingsUnified.title')}>
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="font-semibold text-(--color-muted) text-[10px] uppercase tracking-widest">
              {t('settingsUnified.sections')}
            </span>
            <HelpTooltip content={t('tour.settings.navHelp')} />
          </div>
          <div className="space-y-2">
            {sections.map((section) => (
              <motion.button
                key={section.key}
                onClick={() => handleSectionChange(section.key)}
                className={`group flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-all duration-200 ${
                  activeSection === section.key
                    ? 'glass-panel-strong border border-(--color-primary)/20 shadow-[0_0_15px_var(--color-primary)/8]'
                    : 'glass-panel border border-transparent hover:border-(--color-border)'
                }`}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    activeSection === section.key
                      ? 'bg-(--color-primary)/15 text-(--color-primary)'
                      : 'bg-white/5 text-(--color-muted) group-hover:text-(--color-text)'
                  }`}
                >
                  {section.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium text-sm ${
                        activeSection === section.key
                          ? 'text-(--color-primary)'
                          : 'text-(--color-text)'
                      }`}
                    >
                      {section.label}
                    </span>
                    {section.badge && (
                      <span className="rounded-full bg-(--color-primary)/10 px-2 py-0.5 font-semibold text-(--color-primary) text-[9px] uppercase tracking-wider">
                        {section.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-(--color-muted) text-xs">{section.desc}</p>
                </div>
                <ChevronRight
                  size={14}
                  className={`shrink-0 transition-transform ${
                    activeSection === section.key
                      ? 'rotate-90 text-(--color-primary)'
                      : 'text-(--color-muted) group-hover:text-(--color-text)'
                  }`}
                  aria-hidden="true"
                />
              </motion.button>
            ))}
          </div>

          {/* Quick Access Tiles (below nav on desktop, visible when settings section active) */}
          <AnimatePresence>
            {activeSection === 'settings' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-4 hidden overflow-hidden lg:block"
              >
                <h3 className="mb-2 px-1 font-semibold text-(--color-muted) text-[10px] uppercase tracking-widest">
                  {t('settingsUnified.quickAccess')}
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickTiles.map((tile) => (
                    <button
                      key={tile.tab ?? tile.route ?? tile.label}
                      type="button"
                      onClick={() => {
                        if (tile.route) {
                          navigate(tile.route);
                          return;
                        }
                        handleSectionChange('settings');
                        setSearchParams(
                          applySettingsTabParam(searchParams, resolveSettingsTab(tile.tab ?? null)),
                          { replace: true },
                        );
                      }}
                      className="focus-ring flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/5"
                    >
                      <span className={`${tile.color}`}>{tile.icon}</span>
                      <span className="truncate text-(--color-muted)">{tile.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Right: Content Area */}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {activeSection === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <Suspense fallback={<TabSkeleton />}>
                  <SettingsPage />
                </Suspense>
              </motion.div>
            )}

            {activeSection === 'plugins' && (
              <motion.div
                key="plugins"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <Suspense fallback={<TabSkeleton />}>
                  <PluginsPage embedded />
                </Suspense>
              </motion.div>
            )}

            {activeSection === 'help' && (
              <motion.div
                key="help"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <Suspense fallback={<TabSkeleton />}>
                  <HelpPage embedded />
                </Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <PageCrossLinks />
    </div>
  );
}

export default SettingsUnifiedComponent;
