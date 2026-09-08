import { describe, expect, it } from 'vitest';
import {
  fetchTariffForecast,
  generatePredictiveRecommendation,
  getForecast,
  getPriceHistory,
  queryAIForOptimization,
} from '../lib/predictive-ai';
import type { EnergyData, StoredSettings } from '../types';

const mockEnergyData: EnergyData = {
  gridPower: 200,
  pvPower: 4000,
  batteryPower: -500,
  houseLoad: 1200,
  batterySoC: 45,
  heatPumpPower: 800,
  evPower: 0,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 12.5,
  priceCurrent: 0.12,
};

const mockSettings = {
  chargeThreshold: 0.15,
} as StoredSettings;

describe('Predictive AI', () => {
  describe('fetchTariffForecast', () => {
    it('should return 48 hourly forecast entries', async () => {
      const forecast = await fetchTariffForecast('tibber', 'token');
      expect(forecast).toHaveLength(48);
      expect(forecast[0]).toHaveProperty('timestamp');
      expect(forecast[0]).toHaveProperty('pricePerKwh');
      expect(forecast[0]).toHaveProperty('renewable');
      expect(forecast[0]).toHaveProperty('co2Intensity');
    });

    it('should return numbers for all forecast values', async () => {
      const forecast = await fetchTariffForecast('awattar', 'token');
      for (const entry of forecast) {
        expect(entry.pricePerKwh).toBeTypeOf('number');
        expect(entry.renewable).toBeTypeOf('number');
        expect(entry.co2Intensity).toBeTypeOf('number');
      }
    });
  });

  describe('generatePredictiveRecommendation', () => {
    it('should recommend battery charging when price is below threshold', async () => {
      const forecast = await fetchTariffForecast('tibber', 'token');
      const rec = await generatePredictiveRecommendation(mockEnergyData, forecast, mockSettings);
      expect(rec.action).toBe('charge_battery');
      expect(rec.confidence).toBeGreaterThan(0.5);
      expect(rec.reasoning).toBeTruthy();
      expect(rec.optimalTimeSlot).toHaveProperty('start');
      expect(rec.optimalTimeSlot).toHaveProperty('end');
    });

    it('should recommend EV charging at high PV output', async () => {
      const highPvData = { ...mockEnergyData, pvPower: 5000, priceCurrent: 0.3, batterySoC: 30 };
      const forecast = await fetchTariffForecast('tibber', 'token');
      const rec = await generatePredictiveRecommendation(highPvData, forecast, mockSettings);
      expect(['charge_ev', 'wait', 'charge_battery']).toContain(rec.action);
    });

    it('should include estimatedSavings >= 0', async () => {
      const forecast = await fetchTariffForecast('tibber', 'token');
      const rec = await generatePredictiveRecommendation(mockEnergyData, forecast, mockSettings);
      expect(rec.estimatedSavings).toBeGreaterThanOrEqual(0);
    });

    it('should recommend preheat when the battery is full and prices are moderate', async () => {
      const forecast = await fetchTariffForecast('tibber', 'token');
      const rec = await generatePredictiveRecommendation(
        { ...mockEnergyData, batterySoC: 85, priceCurrent: 0.17, pvPower: 500 },
        forecast,
        mockSettings,
      );
      expect(rec.action).toBe('preheat');
    });

    it('should recommend waiting when a much cheaper slot is ahead', async () => {
      const now = new Date();
      const forecast = [
        {
          timestamp: new Date(now.getTime() + 3_600_000),
          pricePerKwh: 0.05,
          renewable: 50,
          co2Intensity: 120,
        },
        { timestamp: now, pricePerKwh: 0.45, renewable: 30, co2Intensity: 200 },
      ];
      const rec = await generatePredictiveRecommendation(
        { ...mockEnergyData, priceCurrent: 0.45, pvPower: 500, batterySoC: 40 },
        forecast,
        mockSettings,
      );
      expect(rec.action).toBe('wait');
      expect(rec.confidence).toBeGreaterThan(0.8);
    });

    it('should prioritize surplus PV for EV charging', async () => {
      const now = new Date();
      const forecast = [
        { timestamp: now, pricePerKwh: 0.22, renewable: 60, co2Intensity: 100 },
        {
          timestamp: new Date(now.getTime() + 3_600_000),
          pricePerKwh: 0.24,
          renewable: 55,
          co2Intensity: 110,
        },
      ];
      const rec = await generatePredictiveRecommendation(
        { ...mockEnergyData, pvPower: 4500, priceCurrent: 0.28, batterySoC: 55 },
        forecast,
        mockSettings,
      );
      expect(rec.action).toBe('charge_ev');
    });
  });

  describe('queryAIForOptimization', () => {
    it('should return a non-empty string', async () => {
      const result = await queryAIForOptimization('test prompt', 'key');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });
  });

  describe('getPriceHistory', () => {
    it('should return price points for requested hours', async () => {
      const prices = await getPriceHistory('tibber', new Date(), 24);
      expect(prices).toHaveLength(24);
      expect(prices[0]).toHaveProperty('timestamp');
      expect(prices[0]).toHaveProperty('price');
    });
  });

  describe('getForecast', () => {
    it('should generate forecast from price history', async () => {
      const prices = await getPriceHistory('tibber', new Date(), 24);
      const forecast = await getForecast(prices);
      expect(forecast).toBeTruthy();
    });
  });
});
