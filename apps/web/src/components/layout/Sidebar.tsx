import {
  Activity,
  BarChart3,
  BrainCircuit,
  Cpu,
  Database,
  HelpCircle,
  LayoutDashboard,
  Leaf,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Wind,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { useEnergyStoreBase } from '../../core/useEnergyStore';
import { resolveConnectionPresentation } from '../../lib/adapter-mode';
import { useAppStoreShallow } from '../../store';

interface NavItem {
  readonly path: string;
  readonly labelKey: string;
  readonly icon: React.ReactNode;
}

/** Semantic navigation sections for the Smart Power O&M command center. */
interface NavSection {
  readonly id: string;
  readonly labelKey: string;
  readonly items: readonly NavItem[];
}

const navSections: NavSection[] = [
  {
    id: 'command-hub',
    labelKey: 'nav.groupCommandHub',
    items: [{ path: '/', labelKey: 'nav.home', icon: <LayoutDashboard size={20} /> }],
  },
  {
    id: 'live-energy',
    labelKey: 'nav.groupLiveEnergy',
    items: [{ path: '/energy-flow', labelKey: 'nav.energyFlow', icon: <Activity size={20} /> }],
  },
  {
    id: 'devices',
    labelKey: 'nav.groupDevices',
    items: [{ path: '/devices', labelKey: 'nav.devicesOverview', icon: <Zap size={20} /> }],
  },
  {
    id: 'optimization',
    labelKey: 'nav.groupOptimization',
    items: [
      {
        path: '/agent-collaboration',
        labelKey: 'nav.agentCollaboration',
        icon: <BrainCircuit size={20} />,
      },
      { path: '/knowledge-base', labelKey: 'nav.knowledgeBase', icon: <Database size={20} /> },
    ],
  },
  {
    id: 'analytics',
    labelKey: 'nav.groupAnalytics',
    items: [
      { path: '/analytics', labelKey: 'nav.analyticsReports', icon: <BarChart3 size={20} /> },
      { path: '/carbon-reduction', labelKey: 'nav.carbonReduction', icon: <Leaf size={20} /> },
      { path: '/energy-absorption', labelKey: 'nav.energyAbsorption', icon: <Wind size={20} /> },
    ],
  },
  {
    id: 'monitoring',
    labelKey: 'nav.groupMonitoring',
    items: [{ path: '/monitoring', labelKey: 'nav.monitoring', icon: <Monitor size={20} /> }],
  },
  {
    id: 'settings',
    labelKey: 'nav.groupSettingsPlugins',
    items: [
      { path: '/settings', labelKey: 'nav.settingsPlugins', icon: <Settings size={20} /> },
      { path: '/settings/hardware', labelKey: 'nav.hardware', icon: <Cpu size={20} /> },
      { path: '/help', labelKey: 'nav.help', icon: <HelpCircle size={20} /> },
    ],
  },
];

/** Export for consumers that need the flat list of all routes */
// eslint-disable-next-line react-refresh/only-export-components
export const allNavItems: readonly NavItem[] = navSections.flatMap((s) => s.items);

function SidebarComponent() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const presentationMode = new URLSearchParams(search).get('presentation') === 'true';
  const { connected, adapterMode } = useAppStoreShallow((s) => ({
    connected: s.connected,
    adapterMode: s.adapterMode,
  }));
  const serverWsConnected = useEnergyStoreBase((s) => s.serverWsConnected);
  const connectionPresentation = resolveConnectionPresentation(
    connected,
    adapterMode,
    serverWsConnected,
  );
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.nav
      className={`fixed top-0 left-0 z-fixed hidden h-screen flex-col border-(--color-border) border-r bg-(--color-surface) backdrop-blur-3xl transition-[width] duration-300 lg:flex ${
        collapsed ? 'w-16' : 'w-64'
      }`}
      aria-label={t('nav.mainNavigation')}
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Logo + Collapse Toggle */}
      <div className="flex items-center gap-3 border-(--color-border) border-b px-3 py-4">
        <motion.div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/10"
          whileHover={{ rotate: 10, scale: 1.1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <Zap className="h-5 w-5 text-(--color-primary)" aria-hidden="true" />
        </motion.div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="fluid-text-lg truncate font-semibold tracking-tight">
              {t('common.appName')}
            </h1>
            <div
              className="flex items-center gap-1.5"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionPresentation === 'connected'
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                    : connectionPresentation === 'simulation'
                      ? 'bg-(--color-primary) shadow-[0_0_6px_var(--color-primary)]'
                      : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.6)]'
                }`}
                aria-hidden="true"
              />
              {!presentationMode && (
                <span className="text-(--color-muted) text-xs">
                  {connectionPresentation === 'connected'
                    ? t('common.connected')
                    : connectionPresentation === 'simulation'
                      ? t('mode.simulationBadge')
                      : t('common.disconnected')}
                </span>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-white/5 hover:text-(--color-text)"
          aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Navigation — 7 sections */}
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {navSections.map((section) => (
          <div key={section.id}>
            {!collapsed && (
              <h2
                id={`nav-group-${section.id}`}
                className="mb-1.5 px-2 font-semibold text-(--color-muted) text-[10px] uppercase tracking-widest"
              >
                {t(section.labelKey)}
              </h2>
            )}
            <ul
              className="space-y-0.5"
              aria-labelledby={collapsed ? undefined : `nav-group-${section.id}`}
            >
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/' || item.path === '/settings'}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={({ isActive }) =>
                      `sidebar-link group flex items-center rounded-xl font-medium text-sm transition-all duration-200 ${
                        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
                      } ${
                        isActive
                          ? 'sidebar-link-active bg-(--color-primary)/15 text-(--color-primary) shadow-[inset_0_0_0_1px_var(--color-primary)/20]'
                          : 'text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`shrink-0 ${
                            isActive
                              ? 'text-(--color-primary)'
                              : 'text-(--color-muted) group-hover:text-(--color-text)'
                          }`}
                        >
                          {item.icon}
                        </span>
                        {!collapsed && (
                          <>
                            <span className="truncate">{t(item.labelKey)}</span>
                            {isActive && (
                              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-primary)" />
                            )}
                          </>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-(--color-border) border-t px-3 py-3">
        <div
          className={`flex items-center gap-2 text-(--color-muted) text-xs ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="energy-pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-primary)" />
          {!collapsed && <span>智电运维 v{__APP_VERSION__}</span>}
        </div>
      </div>
    </motion.nav>
  );
}

export const Sidebar = SidebarComponent;
