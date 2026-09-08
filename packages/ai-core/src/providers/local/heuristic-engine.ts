/**
 * Deterministic heuristic engine for the eco mode.
 *
 * This engine does not use a neural network. It pattern-matches the user task
 * against a small set of energy-management heuristics and returns a safe,
 * human-readable recommendation. It is the ultimate local fallback when no
 * model is loaded and cloud is disabled.
 */

import type { AIEngine, AIProviderKey, AIRequest, AIResponse } from '../../types.ts';

interface HeuristicRule {
  keywords: string[];
  response: string;
}

const RULES: HeuristicRule[] = [
  {
    keywords: ['battery', 'batterie', 'speicher', 'soc', 'laden', 'entladen'],
    response:
      'Consider keeping the battery between 20 % and 80 % SOC for longer lifetime. Charge from surplus PV during the day and avoid deep discharge at night.',
  },
  {
    keywords: ['solar', 'pv', 'photovoltaic', 'panel', 'modul'],
    response:
      'Use PV forecast data to shift deferrable loads (water heater, EV charging, dishwasher) into high-yield hours. This maximizes self-consumption.',
  },
  {
    keywords: ['tariff', 'tarif', 'tibber', 'awattar', 'octopus', 'nordpool', 'dynamic'],
    response:
      'With dynamic tariffs, schedule high-consumption devices during negative or low-price windows. Respect grid fees and taxes in the total price.',
  },
  {
    keywords: ['ev', 'car', 'wallbox', 'charging', 'laden auto', 'e-auto'],
    response:
      'Charge the EV when PV surplus or cheap tariffs are available. Limit charging power to avoid grid overload and to respect household fuse ratings.',
  },
  {
    keywords: ['heat', 'heizung', 'heating', 'warmwasser', 'boiler'],
    response:
      'Use heat pumps and boilers as thermal storage: heat more during cheap/sunny periods and let the building drift within comfort bounds.',
  },
  {
    keywords: ['read only', 'readonly', 'nur lesen', 'sicherheit'],
    response:
      'Read-only mode is active. No control actions can be dispatched automatically. Review proposals carefully before applying them manually.',
  },
];

export class HeuristicEngine implements AIEngine {
  readonly provider = 'heuristic' as const;
  readonly local = true;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(request: AIRequest, _key?: AIProviderKey): Promise<AIResponse> {
    const startedAt = performance.now();
    const taskLower = request.task.toLowerCase();

    for (const rule of RULES) {
      if (rule.keywords.some((kw) => taskLower.includes(kw))) {
        return this.buildResponse(rule.response, startedAt);
      }
    }

    return this.buildResponse(
      'I can help with energy management topics such as PV self-consumption, battery cycling, dynamic tariffs, EV charging, and heating schedules. For deeper analysis, enable a local model or connect a cloud provider in Settings > AI.',
      startedAt,
    );
  }

  private buildResponse(text: string, startedAt: number): AIResponse {
    return {
      text,
      meta: {
        provider: this.provider,
        model: 'heuristic-rules',
        mode: 'eco',
        local: true,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  }
}
