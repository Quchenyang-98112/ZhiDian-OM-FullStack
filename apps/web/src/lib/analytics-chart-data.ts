/** Deterministic analytics chart series derived from live KPI inputs. */

export const generateEnergyBalance = (pvPower: number, houseLoad: number, now = new Date()) => {
  const currentHour = now.getHours();
  return Array.from({ length: 24 }, (_, i) => {
    const h = i;
    const sunFactor = h >= 6 && h <= 20 ? Math.sin(((h - 6) / 14) * Math.PI) : 0;
    const pv = Math.round(pvPower * sunFactor * (0.7 + (h % 5) * 0.06));
    const base = Math.round(houseLoad * (0.6 + (h % 7) * 0.06));
    const consumption = Math.round(
      base + (h >= 7 && h <= 9 ? 400 : 0) + (h >= 17 && h <= 21 ? 600 : 0),
    );
    const surplus = Math.max(0, pv - consumption);
    const deficit = Math.max(0, consumption - pv);
    return {
      hour: `${String(h).padStart(2, '0')}:00`,
      pv,
      consumption,
      surplus,
      deficit,
      isFuture: h > currentHour,
    };
  });
};

export const generateMonthlyComparison = (pvYieldToday: number) => {
  const months = [
    'Jan',
    'Feb',
    'Mär',
    'Apr',
    'Mai',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Okt',
    'Nov',
    'Dez',
  ];
  const seasonCurve = [0.3, 0.4, 0.6, 0.8, 0.95, 1.0, 1.0, 0.9, 0.75, 0.55, 0.35, 0.25];
  const baseDailyKwh = pvYieldToday > 0 ? pvYieldToday : 18;
  return months.map((m, i) => {
    const prod = Math.round(baseDailyKwh * seasonCurve[i] * 30);
    const cons = Math.round(280 + (i < 3 || i > 9 ? 120 : -40) + (i % 3) * 15);
    return { month: m, production: prod, consumption: cons, savings: Math.round(prod * 0.28) };
  });
};

export const isPeakElectricityHour = (hour: number): boolean => {
  return hour >= 17 && hour <= 21;
};

export const isSolarPeakHour = (hour: number): boolean => {
  return hour >= 10 && hour <= 14;
};
