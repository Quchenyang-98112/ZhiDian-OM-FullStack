import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCo2Savings } from '../lib/pdf-report';

describe('CO₂ Savings Calculation', () => {
  it('should calculate CO₂ savings with UBA 2024 factor (380 g/kWh)', () => {
    // 1000 kWh * 380 g/kWh = 380000 g = 380 kg
    expect(calculateCo2Savings(1000)).toBe(380);
  });

  it('should return 0 for 0 kWh', () => {
    expect(calculateCo2Savings(0)).toBe(0);
  });

  it('should handle fractional kWh values', () => {
    // 10.5 kWh * 380 / 1000 = 3.99 kg
    expect(calculateCo2Savings(10.5)).toBeCloseTo(3.99, 2);
  });

  it('should scale linearly', () => {
    const single = calculateCo2Savings(100);
    const double = calculateCo2Savings(200);
    expect(double).toBeCloseTo(single * 2, 5);
  });
});

describe('PDF report generator', () => {
  const sampleStats = {
    month: 'Januar',
    year: 2026,
    totalPvGeneration: 850.3,
    totalGridImport: 120.5,
    totalGridExport: 380.2,
    totalConsumption: 590.6,
    selfConsumptionRate: 79.5,
    co2Saved: 425.2,
    costSavings: 156.8,
  };

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('generateMonthlyStats returns structured monthly data', async () => {
    const { generateMonthlyStats } = await import('../lib/pdf-report');
    const stats = await generateMonthlyStats(2026, 0);
    expect(stats.year).toBe(2026);
    expect(stats.totalPvGeneration).toBeGreaterThan(0);
    expect(stats.selfConsumptionRate).toBeTypeOf('number');
  });

  it('generatePdfReport returns a PDF blob for valid stats', async () => {
    const { generatePdfReport } = await import('../lib/pdf-report');
    const blob = await generatePdfReport(sampleStats);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('generatePdfReport handles zero-data stats without throwing', async () => {
    const { generatePdfReport } = await import('../lib/pdf-report');
    const blob = await generatePdfReport({
      ...sampleStats,
      totalPvGeneration: 0,
      totalGridImport: 0,
      totalConsumption: 0,
    });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('captureSankeyDiagram serializes visible SVG to PNG data URL', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    document.body.appendChild(svg);

    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/png;base64,abc');
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const imageInstances: Array<{ onload: (() => void) | null; src: string }> = [];
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        width = 100;
        height = 50;
        constructor() {
          imageInstances.push(this);
        }
      },
    );

    const { captureSankeyDiagram } = await import('../lib/pdf-report');
    const promise = captureSankeyDiagram();
    imageInstances[0]?.onload?.();
    const dataUrl = await promise;
    expect(dataUrl).toBe('data:image/png;base64,abc');
    expect(drawImage).toHaveBeenCalled();
  });

  it('captureSankeyDiagram throws when no Sankey SVG is present', async () => {
    const { captureSankeyDiagram } = await import('../lib/pdf-report');
    await expect(captureSankeyDiagram()).rejects.toThrow('Sankey diagram not found');
  });

  it('downloadPdfReport creates a download link for the generated PDF', async () => {
    const click = vi.fn();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { href: '', download: '', click } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName);
    });

    const { downloadPdfReport } = await import('../lib/pdf-report');
    await downloadPdfReport(sampleStats);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pdf');
  });
});
