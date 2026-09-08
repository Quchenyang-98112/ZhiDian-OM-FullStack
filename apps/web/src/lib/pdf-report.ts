/**
 * PDF Monthly Report Generator
 * Creates comprehensive energy reports with Sankey diagrams and CO₂ balance
 * using jsPDF for valid PDF output.
 */

import { calculateCo2Savings } from './format';

// Re-export so existing test imports keep working
export { calculateCo2Savings } from './format';

export interface MonthlyStats {
  month: string;
  year: number;
  totalPvGeneration: number;
  totalGridImport: number;
  totalGridExport: number;
  totalConsumption: number;
  selfConsumptionRate: number;
  co2Saved: number;
  costSavings: number;
}

/**
 * Generates monthly energy statistics
 */
export async function generateMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
  // In production, fetch from IndexedDB
  return {
    month: new Date(year, month).toLocaleString('de-DE', { month: 'long' }),
    year,
    totalPvGeneration: 850.3,
    totalGridImport: 120.5,
    totalGridExport: 380.2,
    totalConsumption: 590.6,
    selfConsumptionRate: 79.5,
    co2Saved: 425.2,
    costSavings: 156.8,
  };
}

/**
 * Captures Sankey diagram as PNG data URL for PDF inclusion
 */
export async function captureSankeyDiagram(): Promise<string> {
  const svgElement = document.querySelector('svg[role="img"]') as SVGSVGElement;
  if (!svgElement) {
    throw new Error('Sankey diagram not found');
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  return new Promise((resolve, reject) => {
    img.onload = () => {
      canvas.width = img.width || 800;
      canvas.height = img.height || 400;
      ctx?.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Safe number formatting that handles NaN/null/undefined */
function fmt(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return `0.${'0'.repeat(decimals)}`;
  return value.toFixed(decimals);
}

/**
 * Generates a valid PDF report using jsPDF.
 * Gracefully handles null/zero data without producing an invalid file.
 */
export async function generatePdfReport(stats: MonthlyStats): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 0;

  // --- Dark background ---
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), 'F');

  // --- Header band ---
  doc.setFillColor(30, 41, 59); // #1e293b
  doc.rect(0, 0, pageW, 45, 'F');

  // Accent line
  doc.setDrawColor(34, 255, 136); // #22ff88
  doc.setLineWidth(0.8);
  doc.line(0, 45, pageW, 45);

  // App name
  y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(34, 255, 136); // primary
  doc.text('NEXUS', margin, y);
  const nexusW = doc.getTextWidth('NEXUS');
  doc.setTextColor(226, 232, 240); // text
  doc.text(' HEMS', margin + nexusW, y);

  // Subtitle
  y = 28;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // muted
  doc.text('Home Energy Management System', margin, y);

  // Report title
  y = 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(226, 232, 240);
  doc.text(`Monatsbericht ${stats.month} ${stats.year}`, margin, y);

  // Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const dateStr = `Erstellt: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  doc.text(dateStr, pageW - margin - doc.getTextWidth(dateStr), y);

  y = 55;

  // --- Detect zero/null data ---
  const hasData =
    (stats.totalPvGeneration ?? 0) > 0 ||
    (stats.totalGridImport ?? 0) > 0 ||
    (stats.totalConsumption ?? 0) > 0;

  if (!hasData) {
    // Zero-data info box
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, 30, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(226, 232, 240);
    doc.text('Keine Messdaten vorhanden', margin + 8, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Fuer diesen Zeitraum liegen keine Energiedaten vor. Bitte pruefen Sie die Verbindung zum Gateway.',
      margin + 8,
      y + 22,
    );
    y += 40;
  }

  // --- KPI Cards ---
  const kpis = [
    {
      label: 'PV-Erzeugung',
      value: fmt(stats.totalPvGeneration),
      unit: 'kWh',
      color: [34, 255, 136] as const,
    },
    {
      label: 'Netzbezug',
      value: fmt(stats.totalGridImport),
      unit: 'kWh',
      color: [255, 136, 0] as const,
    },
    {
      label: 'Netzeinspeisung',
      value: fmt(stats.totalGridExport),
      unit: 'kWh',
      color: [0, 224, 255] as const,
    },
    {
      label: 'Verbrauch',
      value: fmt(stats.totalConsumption),
      unit: 'kWh',
      color: [226, 232, 240] as const,
    },
  ];

  const cardW = (contentW - 6) / 2;
  const cardH = 28;

  kpis.forEach((kpi, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = margin + col * (cardW + 6);
    const cy = y + row * (cardH + 5);

    // Card background
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'F');

    // Accent bar
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(cx, cy, 2, cardH, 'F');

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, cx + 8, cy + 9);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, cx + 8, cy + 22);

    // Unit
    const valW = doc.getTextWidth(kpi.value);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(` ${kpi.unit}`, cx + 8 + valW, cy + 22);
  });

  y += 2 * (cardH + 5) + 8;

  // --- Self-consumption & CO₂ section ---
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, y, contentW, 38, 3, 3, 'F');

  // Self-consumption rate
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Eigenverbrauchsquote', margin + 8, y + 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(34, 255, 136);
  doc.text(`${fmt(stats.selfConsumptionRate)}%`, margin + 8, y + 25);

  // Progress bar
  const barX = margin + 8;
  const barY = y + 29;
  const barW = contentW / 2 - 16;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(barX, barY, barW, 3, 1.5, 1.5, 'F');
  const fillW = Math.min(barW, barW * ((stats.selfConsumptionRate ?? 0) / 100));
  if (fillW > 0) {
    doc.setFillColor(34, 255, 136);
    doc.roundedRect(barX, barY, fillW, 3, 1.5, 1.5, 'F');
  }

  // CO₂ savings
  const co2 = calculateCo2Savings(
    Math.max(0, (stats.totalPvGeneration ?? 0) - (stats.totalGridExport ?? 0)),
  );
  const midX = pageW / 2 + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('CO2-Einsparung', midX, y + 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0, 224, 255);
  doc.text(`${fmt(co2)} kg`, midX, y + 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Netzfaktor: 380 g CO2/kWh (UBA 2024)`, midX, y + 33);

  y += 46;

  // --- Cost savings ---
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, y, contentW, 22, 3, 3, 'F');
  doc.setFillColor(34, 255, 136);
  doc.rect(margin, y, 2, 22, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Kostenersparnis', margin + 8, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(34, 255, 136);
  doc.text(`EUR ${fmt(stats.costSavings, 2)}`, margin + 8, y + 18);

  y += 30;

  // --- Sankey diagram inclusion ---
  try {
    const sankeyImage = await captureSankeyDiagram();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(226, 232, 240);
    doc.text('Energiefluss (Sankey-Diagramm)', margin, y);
    y += 5;

    doc.addImage(sankeyImage, 'PNG', margin, y, contentW, contentW * 0.5);
    y += contentW * 0.5 + 8;
  } catch {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Sankey-Diagramm nicht verfuegbar (Seite nicht sichtbar).', margin, y);
    y += 10;
  }

  // --- Footer ---
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor(34, 255, 136);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Nexus HEMS Dashboard — Automatisch generierter Monatsbericht', margin, footerY);
  const pageNum = `Seite 1/1`;
  doc.text(pageNum, pageW - margin - doc.getTextWidth(pageNum), footerY);

  return doc.output('blob');
}

/**
 * Downloads PDF report
 */
export async function downloadPdfReport(stats: MonthlyStats): Promise<void> {
  const blob = await generatePdfReport(stats);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const monthNum = new Date(`${stats.month} 1, ${stats.year}`).getMonth() + 1;
  const monthStr = String(Number.isFinite(monthNum) ? monthNum : 1).padStart(2, '0');
  a.download = `nexus-hems-report-${stats.year}-${monthStr}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
