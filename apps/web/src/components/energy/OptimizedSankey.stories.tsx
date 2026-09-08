import type { Meta, StoryObj } from '@storybook/react';
import type { EnergyData } from '../../types';
import { OptimizedSankey } from './OptimizedSankey';

const mockData: EnergyData = {
  pvPower: 3200,
  gridPower: -800,
  batteryPower: -600,
  houseLoad: 1800,
  batterySoC: 72,
  heatPumpPower: 450,
  evPower: 0,
  gridVoltage: 230,
  batteryVoltage: 48,
  pvYieldToday: 18.4,
  priceCurrent: 0.182,
};

const meta: Meta<typeof OptimizedSankey> = {
  title: 'Energy/OptimizedSankey',
  component: OptimizedSankey,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[500px] w-full p-4">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof OptimizedSankey>;

export const Default: Story = {
  args: {
    data: mockData,
    allowFullscreen: true,
    className: 'h-full rounded-3xl glass-panel',
  },
};

export const WithDetailPanel: Story = {
  args: {
    data: mockData,
    allowFullscreen: true,
    detailOpen: true,
    detailPanel: (
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-(--color-text)">PV-Anlage</p>
        <p className="text-(--color-muted)">
          3.200 W Erzeugung · 800 W Einspeisung · 600 W → Batterie
        </p>
      </div>
    ),
    className: 'h-full rounded-3xl glass-panel',
  },
};

export const MinimalNoActions: Story = {
  args: {
    data: mockData,
    className: 'h-full',
  },
};
