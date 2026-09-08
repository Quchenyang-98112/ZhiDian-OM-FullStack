/**
 * useNotifications — monitors energy-store changes and fires push
 * notifications for critical HEMS events.
 *
 * Events monitored:
 *  • EV charging finished  (status: 'finishing')
 *  • EV charger fault      (status: 'faulted')
 *  • Tariff spike          (price exceeds threshold)
 *  • Tariff drop           (price drops below threshold)
 *  • Battery SoC low       (below configurable %)
 *  • Grid anomaly          (voltage out of 207–253 V band)
 *
 * This hook subscribes to useEnergyStore outside React render cycle and
 * reads settings from useAppStore to respect toggles and quiet hours.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../core/adapters/EnergyAdapter';
import { useEnergyStoreBase } from '../core/useEnergyStore';
import { useAppStore } from '../store';
import {
  isCoolingDown,
  isInQuietHours,
  markSent,
  type NotificationCategory,
  showNotification,
} from './notifications';

// ---------------------------------------------------------------------------
// Previous-state tracker (for edge detection)
// ---------------------------------------------------------------------------

interface PreviousState {
  evStatus?: string;
  batterySoC?: number;
  price?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications(): void {
  const { t } = useTranslation();
  const prev = useRef<PreviousState>({});

  useEffect(() => {
    const iconUrl =
      typeof location !== 'undefined'
        ? `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/icon.svg`
        : '/icon.svg';

    const unsubscribe = useEnergyStoreBase.subscribe((state) => {
      const settings = useAppStore.getState().settings;
      if (!settings.pushNotifications) return;

      if (
        isInQuietHours(settings.quietHoursEnabled, settings.quietHoursStart, settings.quietHoursEnd)
      )
        return;

      const { unified } = state;
      checkEV(unified, settings, prev.current, t, iconUrl);
      checkTariff(unified, settings, prev.current, t, iconUrl);
      checkBattery(unified, settings, prev.current, t, iconUrl);
      checkGrid(unified, settings, t, iconUrl);

      // Update previous state for edge detection
      prev.current = {
        ...(unified.evCharger?.status != null && { evStatus: unified.evCharger.status }),
        batterySoC: unified.battery.socPercent,
        ...(unified.tariff?.currentPriceEurKWh != null && {
          price: unified.tariff.currentPriceEurKWh,
        }),
      };
    });

    return unsubscribe;
  }, [t]);
}

// ---------------------------------------------------------------------------
// Checkers
// ---------------------------------------------------------------------------

type TFunc = ReturnType<typeof useTranslation>['t'];
type Settings = ReturnType<typeof useAppStore.getState>['settings'];

function fire(category: NotificationCategory, title: string, body: string, icon: string) {
  if (isCoolingDown(category)) return;
  markSent(category);
  void showNotification({ id: `${category}-${Date.now()}`, category, title, body, icon });
}

function checkEV(
  m: UnifiedEnergyModel,
  _settings: Settings,
  prev: PreviousState,
  t: TFunc,
  icon: string,
) {
  if (!m.evCharger) return;
  const s = m.evCharger.status;

  // EV ready — transition INTO 'finishing' from any other state
  if (s === 'finishing' && prev.evStatus !== 'finishing') {
    fire(
      'ev-ready',
      t('notifications.evReadyTitle', 'EV charging complete'),
      t('notifications.evReadyBody', 'Your vehicle is fully charged and ready to go.'),
      icon,
    );
  }

  // EV fault
  if (s === 'faulted' && prev.evStatus !== 'faulted') {
    fire(
      'ev-fault',
      t('notifications.evFaultTitle', 'EV charger fault'),
      t('notifications.evFaultBody', 'The EV charger reported a fault. Check the wallbox.'),
      icon,
    );
  }
}

function checkTariff(
  m: UnifiedEnergyModel,
  settings: Settings,
  prev: PreviousState,
  t: TFunc,
  icon: string,
) {
  if (!settings.priceAlerts) return;
  const price = m.tariff?.currentPriceEurKWh;
  if (price == null || prev.price == null) return;
  const threshold = settings.priceAlertThreshold;

  // Spike — price crosses above threshold
  if (price >= threshold && prev.price < threshold) {
    fire(
      'tariff-spike',
      t('notifications.tariffSpikeTitle', 'Tariff spike'),
      t('notifications.tariffSpikeBody', 'Electricity price rose to {{price}} €/kWh.', {
        price: price.toFixed(3),
      }),
      icon,
    );
  }

  // Drop — price crosses below threshold
  if (price < threshold && prev.price >= threshold) {
    fire(
      'tariff-drop',
      t('notifications.tariffDropTitle', 'Low tariff'),
      t(
        'notifications.tariffDropBody',
        'Electricity price dropped to {{price}} €/kWh — ideal time to charge.',
        {
          price: price.toFixed(3),
        },
      ),
      icon,
    );
  }
}

function checkBattery(
  m: UnifiedEnergyModel,
  settings: Settings,
  prev: PreviousState,
  t: TFunc,
  icon: string,
) {
  if (!settings.batteryAlerts) return;
  const soc = m.battery.socPercent;
  const threshold = settings.batteryAlertThreshold;

  // Alert when SoC drops BELOW threshold (edge: was above, now below)
  if (soc < threshold && (prev.batterySoC == null || prev.batterySoC >= threshold)) {
    fire(
      'battery-low',
      t('notifications.batteryLowTitle', 'Battery low'),
      t('notifications.batteryLowBody', 'Battery state of charge is at {{soc}}%.', {
        soc: Math.round(soc),
      }),
      icon,
    );
  }
}

function checkGrid(m: UnifiedEnergyModel, settings: Settings, t: TFunc, icon: string) {
  if (!settings.gridAlerts) return;
  const v = m.grid.voltageV;
  if (v <= 0) return; // No data

  // EN 50160 tolerance: 230 V ± 10% → 207–253 V
  if (v < 207 || v > 253) {
    fire(
      'grid-anomaly',
      t('notifications.gridAnomalyTitle', 'Grid anomaly'),
      t('notifications.gridAnomalyBody', 'Grid voltage at {{voltage}} V — outside normal range.', {
        voltage: Math.round(v),
      }),
      icon,
    );
  }
}
