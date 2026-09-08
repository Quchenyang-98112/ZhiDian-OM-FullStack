/**
 * CO₂ Report Module — Monthly Carbon Balance Reports
 *
 * Generates detailed CO₂ emission/savings reports based on:
 *   - UBA (Umweltbundesamt) grid emission factors
 *   - Historical energy data from IndexedDB
 *   - Self-consumption vs. grid import analysis
 *   - Feed-in displacement credits
 *
 * Supports PDF export via jsPDF integration.
 */

import type { EnergySnapshot } from './db';
import type { DailyAggregate, MonthlyAggregate } from './ml-forecast';
import { aggregateDaily } from './ml-forecast';

// ─── UBA Emission Factors ───────────────────────────────────────────

/**
 * German grid CO₂ emission factors (g CO₂/kWh) by year.
 * Source: Umweltbundesamt (UBA), "Entwicklung der spezifischen Treibhausgas-
 * Emissionen des deutschen Strommix"
 */
export const UBA_EMISSION_FACTORS: Record<number, number> = {
  2020: 366,
  2021: 410,
  2022: 434,
  2023: 380,
  2024: 380,
  2025: 364,
  2026: 350, // projected
};

/**
 * Get the UBA emission factor for a given year.
 * Falls back to the latest known value.
 */
export function getUbaFactor(year: number): number {
  return UBA_EMISSION_FACTORS[year] ?? UBA_EMISSION_FACTORS[2025] ?? 364;
}

// ─── CO₂ Calculation Types ──────────────────────────────────────────

/** Detailed CO₂ balance for a time period */
export interface Co2Balance {
  /** Period label (e.g. "März 2026") */
  period: string;
  /** Year */
  year: number;
  /** Month (0-indexed) */
  month: number;

  /** UBA factor used (g CO₂/kWh) */
  ubaFactor: number;

  /** Grid import emissions (kg CO₂) */
  gridEmissionsKg: number;
  /** CO₂ saved by self-consumption (kg) — PV that displaced grid import */
  selfConsumptionSavingsKg: number;
  /** CO₂ displaced by feed-in (kg) — PV exported that displaces other generators */
  feedInDisplacementKg: number;
  /** Net CO₂ balance (kg) — negative = net saver */
  netBalanceKg: number;

  /** Equivalences for context */
  equivalences: {
    /** Trees equivalent for CO₂ saved (1 tree ≈ 22 kg CO₂/year) */
    treesEquivalent: number;
    /** km of driving equivalent (average car ≈ 120 g CO₂/km) */
    carKmEquivalent: number;
    /** Flights Frankfurt–Mallorca equivalent (≈ 250 kg CO₂) */
    shortFlightsEquivalent: number;
  };

  /** Daily breakdown */
  dailyData: DailyAggregate[];
  /** Monthly summary (if applicable) */
  monthlySummary?: MonthlyAggregate;
}

/** Annual CO₂ summary */
export interface AnnualCo2Summary {
  year: number;
  months: Co2Balance[];
  totalGridEmissionsKg: number;
  totalSelfConsumptionSavingsKg: number;
  totalFeedInDisplacementKg: number;
  totalNetBalanceKg: number;
  avgMonthlyNetKg: number;
  bestMonth: { month: string; savingsKg: number };
  worstMonth: { month: string; savingsKg: number };
}

// ─── CO₂ Balance Calculation ────────────────────────────────────────

/**
 * Calculate CO₂ balance for a set of daily aggregates.
 */
export function calculateCo2Balance(
  dailyData: DailyAggregate[],
  year: number,
  month: number,
  locale: string = 'de-DE',
): Co2Balance {
  const factor = getUbaFactor(year);
  const factorKg = factor / 1000; // convert g → kg per kWh

  const totalGridImport = dailyData.reduce((s, d) => s + d.gridImportKwh, 0);
  const totalGridExport = dailyData.reduce((s, d) => s + d.gridExportKwh, 0);
  const totalPv = dailyData.reduce((s, d) => s + d.pvGenerationKwh, 0);
  const selfConsumed = Math.max(0, totalPv - totalGridExport);

  const gridEmissionsKg = totalGridImport * factorKg;
  const selfConsumptionSavingsKg = selfConsumed * factorKg;
  const feedInDisplacementKg = totalGridExport * factorKg;
  const netBalanceKg = gridEmissionsKg - selfConsumptionSavingsKg - feedInDisplacementKg;

  const totalSaved = selfConsumptionSavingsKg + feedInDisplacementKg;

  const period = new Date(year, month).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  return {
    period,
    year,
    month,
    ubaFactor: factor,
    gridEmissionsKg,
    selfConsumptionSavingsKg,
    feedInDisplacementKg,
    netBalanceKg,
    equivalences: {
      treesEquivalent: totalSaved / (22 / 12), // monthly portion of tree absorption
      carKmEquivalent: totalSaved / 0.12, // 120 g/km → 0.12 kg/km
      shortFlightsEquivalent: totalSaved / 250,
    },
    dailyData,
  };
}

/**
 * Calculate CO₂ balance from raw snapshots for a given month.
 */
export function calculateMonthlyCo2(
  snapshots: EnergySnapshot[],
  year: number,
  month: number,
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
  locale: string = 'de-DE',
): Co2Balance {
  // Filter snapshots to the target month
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();

  const monthSnapshots = snapshots.filter(
    (s) => s.timestamp >= monthStart && s.timestamp < monthEnd,
  );

  const dailyData = aggregateDaily(monthSnapshots, gridPriceAvg, feedInTariff);
  return calculateCo2Balance(dailyData, year, month, locale);
}

/**
 * Generate annual CO₂ summary from all available snapshots.
 */
export function calculateAnnualCo2(
  snapshots: EnergySnapshot[],
  year: number,
  gridPriceAvg: number = 0.25,
  feedInTariff: number = 0.082,
  locale: string = 'de-DE',
): AnnualCo2Summary {
  const months: Co2Balance[] = [];

  for (let m = 0; m < 12; m++) {
    const balance = calculateMonthlyCo2(snapshots, year, m, gridPriceAvg, feedInTariff, locale);
    if (balance.dailyData.length > 0) {
      months.push(balance);
    }
  }

  const totalGrid = months.reduce((s, m) => s + m.gridEmissionsKg, 0);
  const totalSelf = months.reduce((s, m) => s + m.selfConsumptionSavingsKg, 0);
  const totalFeedIn = months.reduce((s, m) => s + m.feedInDisplacementKg, 0);
  const totalNet = months.reduce((s, m) => s + m.netBalanceKg, 0);

  let best = { month: '–', savingsKg: 0 };
  let worst = { month: '–', savingsKg: Number.MAX_VALUE };

  for (const m of months) {
    const savings = m.selfConsumptionSavingsKg + m.feedInDisplacementKg;
    if (savings > best.savingsKg) best = { month: m.period, savingsKg: savings };
    if (savings < worst.savingsKg) worst = { month: m.period, savingsKg: savings };
  }

  if (worst.savingsKg === Number.MAX_VALUE) worst = { month: '–', savingsKg: 0 };

  return {
    year,
    months,
    totalGridEmissionsKg: totalGrid,
    totalSelfConsumptionSavingsKg: totalSelf,
    totalFeedInDisplacementKg: totalFeedIn,
    totalNetBalanceKg: totalNet,
    avgMonthlyNetKg: months.length > 0 ? totalNet / months.length : 0,
    bestMonth: best,
    worstMonth: worst,
  };
}

// ─── CO₂ PDF Report ─────────────────────────────────────────────────

/** Safe number formatting for PDF */
function fmt(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return `0.${'0'.repeat(decimals)}`;
  return value.toFixed(decimals);
}

/**
 * Generate a CO₂ monthly report PDF.
 */
export async function generateCo2ReportPdf(balance: Co2Balance): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ── Dark background ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), 'F');

  // ── Header ──
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageW, 45, 'F');

  doc.setDrawColor(34, 255, 136);
  doc.setLineWidth(0.8);
  doc.line(0, 45, pageW, 45);

  y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(34, 255, 136);
  doc.text('NEXUS', margin, y);
  const nexW = doc.getTextWidth('NEXUS');
  doc.setTextColor(226, 232, 240);
  doc.text(' HEMS', margin + nexW, y);

  y = 28;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('CO\u2082-Bericht • Umweltbundesamt-Faktor', margin, y);

  y = 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(226, 232, 240);
  doc.text(`CO\u2082-Bilanz ${balance.period}`, margin, y);

  const dateStr = `Erstellt: ${new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(dateStr, pageW - margin - doc.getTextWidth(dateStr), y);

  y = 55;

  // ── UBA Factor Banner ──
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, y, contentW, 18, 3, 3, 'F');
  doc.setFillColor(0, 200, 100);
  doc.rect(margin, y, 3, 18, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`UBA Emissionsfaktor ${balance.year}`, margin + 10, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 224, 255);
  doc.text(`${balance.ubaFactor} g CO\u2082/kWh`, margin + 10, y + 15);

  y += 26;

  // ── Main CO₂ Cards ──
  const cards = [
    {
      label: 'Netzbezug-Emissionen',
      value: fmt(balance.gridEmissionsKg),
      unit: 'kg CO\u2082',
      color: [255, 136, 0] as const,
      desc: 'Durch Netzstromverbrauch verursacht',
    },
    {
      label: 'Eigenverbrauch-Einsparung',
      value: fmt(balance.selfConsumptionSavingsKg),
      unit: 'kg CO\u2082',
      color: [34, 255, 136] as const,
      desc: 'Durch direkte PV-Nutzung vermieden',
    },
    {
      label: 'Einspeisung-Verdr\u00e4ngung',
      value: fmt(balance.feedInDisplacementKg),
      unit: 'kg CO\u2082',
      color: [0, 224, 255] as const,
      desc: 'Durch Netzeinspeisung verdraengt',
    },
  ];

  const cardW = (contentW - 8) / 3;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const cx = margin + i * (cardW + 4);

    doc.setFillColor(30, 41, 59);
    doc.roundedRect(cx, y, cardW, 36, 3, 3, 'F');
    doc.setFillColor(c.color[0], c.color[1], c.color[2]);
    doc.rect(cx, y, 2, 36, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, cx + 6, y + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    doc.text(c.value, cx + 6, y + 21);

    const vW = doc.getTextWidth(c.value);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(` ${c.unit}`, cx + 6 + vW, y + 21);

    doc.setFontSize(6);
    doc.text(c.desc, cx + 6, y + 30);
  }

  y += 44;

  // ── Net Balance ──
  const isPositive = balance.netBalanceKg > 0;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, y, contentW, 28, 3, 3, 'F');
  doc.setFillColor(isPositive ? 255 : 34, isPositive ? 100 : 255, isPositive ? 100 : 136);
  doc.rect(margin, y, 3, 28, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Netto CO\u2082-Bilanz', margin + 10, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(isPositive ? 255 : 34, isPositive ? 100 : 255, isPositive ? 100 : 136);
  const sign = balance.netBalanceKg <= 0 ? '' : '+';
  doc.text(`${sign}${fmt(balance.netBalanceKg)} kg CO\u2082`, margin + 10, y + 23);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const statusText =
    balance.netBalanceKg <= 0
      ? 'Netto-Klimaschuetzer — mehr CO\u2082 vermieden als verursacht!'
      : 'Netto-Emittent — Eigenverbrauchsquote erhoehen empfohlen';
  doc.text(statusText, margin + 90, y + 12);

  y += 36;

  // ── Equivalences ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text('Aequivalenzen', margin, y);
  y += 6;

  const eqs = [
    {
      emoji: '\ud83c\udf33',
      label: 'Baeume (monatl. Anteil)',
      value: fmt(balance.equivalences.treesEquivalent, 0),
    },
    {
      emoji: '\ud83d\ude97',
      label: 'Auto-km vermieden',
      value: fmt(balance.equivalences.carKmEquivalent, 0),
    },
    {
      emoji: '\u2708\ufe0f',
      label: 'Kurzstrecken-Fluege',
      value: fmt(balance.equivalences.shortFlightsEquivalent, 2),
    },
  ];

  const eqW = (contentW - 8) / 3;
  for (let i = 0; i < eqs.length; i++) {
    const eq = eqs[i];
    const ex = margin + i * (eqW + 4);

    doc.setFillColor(30, 41, 59);
    doc.roundedRect(ex, y, eqW, 22, 3, 3, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${eq.emoji} ${eq.label}`, ex + 6, y + 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(226, 232, 240);
    doc.text(eq.value, ex + 6, y + 19);
  }

  y += 30;

  // ── Daily Breakdown Table ──
  if (balance.dailyData.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(226, 232, 240);
    doc.text('Tagesbilanz CO\u2082', margin, y);
    y += 5;

    // Table header
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);

    const cols = [
      { x: margin + 2, label: 'Datum' },
      { x: margin + 30, label: 'PV (kWh)' },
      { x: margin + 55, label: 'Import (kWh)' },
      { x: margin + 80, label: 'Export (kWh)' },
      { x: margin + 105, label: 'CO\u2082 gespart (kg)' },
      { x: margin + 135, label: 'Autarkie (%)' },
    ];
    for (const col of cols) {
      doc.text(col.label, col.x, y + 5.5);
    }
    y += 9;

    // Table rows (max 31 days)
    doc.setFont('helvetica', 'normal');
    const maxRows = Math.min(balance.dailyData.length, 31);
    for (let i = 0; i < maxRows; i++) {
      const d = balance.dailyData[i];
      if (y > 270) break; // page overflow protection

      if (i % 2 === 0) {
        doc.setFillColor(20, 30, 48);
        doc.rect(margin, y - 1, contentW, 6, 'F');
      }

      doc.setTextColor(180, 190, 200);
      doc.setFontSize(6);
      doc.text(d.date.slice(5), cols[0].x, y + 3);
      doc.text(fmt(d.pvGenerationKwh), cols[1].x, y + 3);
      doc.text(fmt(d.gridImportKwh), cols[2].x, y + 3);
      doc.text(fmt(d.gridExportKwh), cols[3].x, y + 3);
      doc.text(fmt(d.co2SavedKg), cols[4].x, y + 3);
      doc.text(fmt(d.autarkyRate, 0), cols[5].x, y + 3);
      y += 6;
    }
  }

  y += 8;

  // ── Footer ──
  doc.setDrawColor(34, 255, 136);
  doc.setLineWidth(0.3);
  doc.line(margin, 282, pageW - margin, 282);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `NEXUS HEMS • CO\u2082-Bericht • UBA-Faktor ${balance.ubaFactor} g/kWh (${balance.year})`,
    margin,
    287,
  );
  doc.text(
    new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    pageW - margin - 20,
    287,
  );

  return doc.output('blob');
}

/**
 * Download CO₂ report as PDF.
 */
export async function downloadCo2Report(balance: Co2Balance): Promise<void> {
  const blob = await generateCo2ReportPdf(balance);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-co2-report-${balance.year}-${String(balance.month + 1).padStart(2, '0')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
