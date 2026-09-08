import { motion } from 'motion/react';
import type { RefObject } from 'react';
import type { ConnectionPresentation } from '../../lib/adapter-mode';
import { AppShellHeaderBar } from './AppShellHeaderBar';
import { AppShellHeaderTicker } from './AppShellHeaderTicker';

/** Props for {@link AppShellHeader}. */
export interface AppShellHeaderProps {
  /** Ref attached to the fixed header element for height measurement. */
  headerRef: RefObject<HTMLElement | null>;
  /** Whether the page has scrolled past the header threshold. */
  scrolled: boolean;
  /** Whether live adapter mode is active. */
  isLive: boolean;
  /** Whether the backend enforces read-only mode. */
  isReadOnly: boolean;
  /** Resolved connection chrome label (connected / simulation / disconnected). */
  connectionPresentation: ConnectionPresentation;
  /** Whether any enabled adapter is degraded. */
  hasDegradedAdapter: boolean;
  /** Current electricity price in €/kWh. */
  priceCurrent: number;
  /** PV production in watts. */
  pvPower: number;
  /** Battery state of charge (0–100). */
  batterySoC: number;
  /** Grid power in watts (positive = import, negative = export). */
  gridPower: number;
  /** House load in watts. */
  houseLoad: number;
  /** Opens the global command palette. */
  onOpenCommandPalette: () => void;
}

/**
 * Fixed app header: safety banners, navigation actions, and live KPI ticker.
 */
export function AppShellHeader({
  headerRef,
  scrolled,
  isLive,
  isReadOnly,
  connectionPresentation,
  hasDegradedAdapter,
  priceCurrent,
  pvPower,
  batterySoC,
  gridPower,
  houseLoad,
  onOpenCommandPalette,
}: AppShellHeaderProps) {
  const selfSufficiencyPercent =
    houseLoad > 0
      ? Math.min(100, Math.round(((houseLoad - Math.max(0, gridPower)) / houseLoad) * 100))
      : 0;

  return (
    <motion.header
      ref={headerRef}
      data-scrolled={scrolled ? 'true' : 'false'}
      className="app-header header-accent-line fixed top-0 right-0 left-0 z-sticky overflow-hidden px-3 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5 sm:px-6 sm:pt-[max(0.75rem,env(safe-area-inset-top))] sm:pb-3 lg:left-64"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <AppShellHeaderBar
        isLive={isLive}
        isReadOnly={isReadOnly}
        connectionPresentation={connectionPresentation}
        hasDegradedAdapter={hasDegradedAdapter}
        priceCurrent={priceCurrent}
        onOpenCommandPalette={onOpenCommandPalette}
      />
      <AppShellHeaderTicker
        priceCurrent={priceCurrent}
        pvPower={pvPower}
        batterySoC={batterySoC}
        gridPower={gridPower}
        selfSufficiencyPercent={selfSufficiencyPercent}
      />
    </motion.header>
  );
}
