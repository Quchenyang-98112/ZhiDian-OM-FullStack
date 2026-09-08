import { Router } from 'express';
import { requireJWT } from '../middleware/auth.js';

export function createGrafanaRoutes(): Router {
  const router = Router();

  // Grafana Dashboard provisioning — requires JWT in production
  router.get('/api/grafana/dashboard', requireJWT, (_req, res) => {
    res.json({
      dashboard: {
        id: null,
        uid: 'nexus-hems-overview',
        title: 'Nexus HEMS — Energy Overview',
        timezone: 'browser',
        refresh: '5s',
        time: { from: 'now-1h', to: 'now' },
        panels: [
          {
            title: 'PV Generation',
            type: 'timeseries',
            gridPos: { h: 8, w: 12, x: 0, y: 0 },
            targets: [{ expr: 'hems_pv_power_watts', legendFormat: 'PV Power' }],
            fieldConfig: {
              defaults: { unit: 'watt', color: { mode: 'fixed', fixedColor: 'yellow' } },
            },
          },
          {
            title: 'Grid Power',
            type: 'timeseries',
            gridPos: { h: 8, w: 12, x: 12, y: 0 },
            targets: [
              { expr: 'hems_grid_power_watts', legendFormat: 'Grid (+ import / - export)' },
            ],
            fieldConfig: { defaults: { unit: 'watt' } },
          },
          {
            title: 'Battery SoC',
            type: 'gauge',
            gridPos: { h: 8, w: 6, x: 0, y: 8 },
            targets: [{ expr: 'hems_battery_soc_percent' }],
            fieldConfig: { defaults: { unit: 'percent', min: 0, max: 100 } },
          },
          {
            title: 'House Load',
            type: 'stat',
            gridPos: { h: 4, w: 6, x: 6, y: 8 },
            targets: [{ expr: 'hems_house_load_watts' }],
            fieldConfig: { defaults: { unit: 'watt' } },
          },
          {
            title: 'Electricity Price',
            type: 'timeseries',
            gridPos: { h: 8, w: 12, x: 12, y: 8 },
            targets: [{ expr: 'hems_tariff_price_eur_per_kwh', legendFormat: '{{provider}}' }],
            fieldConfig: { defaults: { unit: 'currencyEUR', decimals: 3 } },
          },
          {
            title: 'Adapter Status',
            type: 'table',
            gridPos: { h: 6, w: 24, x: 0, y: 16 },
            targets: [{ expr: 'hems_adapter_connected', format: 'table', instant: true }],
          },
        ],
        templating: {
          list: [
            {
              name: 'adapter',
              type: 'query',
              query: 'label_values(hems_adapter_connected, adapter)',
              refresh: 2,
              multi: true,
              includeAll: true,
            },
          ],
        },
      },
      overwrite: true,
    });
  });

  return router;
}
