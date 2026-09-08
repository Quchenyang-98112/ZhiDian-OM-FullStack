import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnergyStoreBase } from '../../core/useEnergyStore';
import { themeDefinitions } from '../../design-tokens';
import { isLiveSafetyMode, resolveConnectionPresentation } from '../../lib/adapter-mode';
import { getDisplayData } from '../../lib/demo-data';
import { resolveReadOnlyModeActive } from '../../lib/use-read-only-mode';
import { useAppStoreShallow } from '../../store';
import { CommandPaletteWithSafety } from '../command-palette/CommandPaletteWithSafety';
import { useCommandPalette } from '../ui/CommandPalette';
import { MobileNavigation } from '../ui/MobileNavigation';
import { AppShellHeader } from './AppShellHeader';
import { Breadcrumbs } from './Breadcrumbs';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Application chrome: sidebar, fixed header, routed page content, and mobile nav.
 *
 * @param props.children - Active route page content.
 */
export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const { isOpen: isCommandPaletteOpen, setIsOpen: setCommandPaletteOpen } = useCommandPalette();

  const { energyData, connected, adapterMode, theme, backendReadOnly } = useAppStoreShallow(
    (s) => ({
      energyData: s.energyData,
      connected: s.connected,
      adapterMode: s.adapterMode,
      theme: s.theme,
      backendReadOnly: s.backendReadOnly,
    }),
  );

  const serverWsConnected = useEnergyStoreBase((s) => s.serverWsConnected);

  const connectionPresentation = resolveConnectionPresentation(
    connected,
    adapterMode,
    serverWsConnected,
  );
  const displayEnergy =
    connectionPresentation === 'simulation' ? getDisplayData(energyData, connected) : energyData;

  const { priceCurrent, pvPower, batterySoC, gridPower, houseLoad } = displayEnergy;

  const isLive = isLiveSafetyMode(adapterMode);
  const isReadOnly = resolveReadOnlyModeActive(backendReadOnly);

  const hasDegradedAdapter = useEnergyStoreBase((s) =>
    Object.values(s.adapters).some(
      (a) => a.enabled && (a.status === 'error' || a.circuitState === 'open'),
    ),
  );

  const themeDefinition = themeDefinitions[theme];
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const applyHeight = () => root.style.setProperty('--header-height', `${el.offsetHeight}px`);
    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(el);
    window.addEventListener('resize', applyHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applyHeight);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="theme-shell min-h-dvh font-sans text-(--color-text) selection:bg-(--color-primary)/30">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          background: `linear-gradient(145deg, ${themeDefinition.colors.background} 0%, ${themeDefinition.colors.background} 60%, ${themeDefinition.colors.glow} 100%)`,
        }}
      />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:rounded-xl focus:bg-(--color-text) focus:px-4 focus:py-2 focus:text-(--color-background) focus:shadow-lg"
      >
        {t('accessibility.skipToContent')}
      </a>

      <Sidebar />

      <div className="relative lg:ml-64" style={{ paddingTop: 'var(--header-height, 4.5rem)' }}>
        <AppShellHeader
          headerRef={headerRef}
          scrolled={scrolled}
          isLive={isLive}
          isReadOnly={isReadOnly}
          connectionPresentation={connectionPresentation}
          hasDegradedAdapter={hasDegradedAdapter}
          priceCurrent={priceCurrent}
          pvPower={pvPower}
          batterySoC={batterySoC}
          gridPower={gridPower}
          houseLoad={houseLoad}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="pattern-grid mx-auto max-w-7xl px-4 py-6 pb-[max(7.5rem,calc(7.5rem+env(safe-area-inset-bottom)))] outline-none sm:px-6 lg:px-8 lg:pb-6"
        >
          <Breadcrumbs />
          {children}
        </main>
      </div>

      <CommandPaletteWithSafety
        isOpen={isCommandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOptimize={() => {
          document.getElementById('ai-optimizer')?.scrollIntoView({ behavior: 'smooth' });
        }}
        onExportReport={() => {
          const exportButton = document.querySelector('[data-export-report]') as HTMLButtonElement;
          exportButton?.click();
        }}
      />

      <MobileNavigation />
    </div>
  );
}
