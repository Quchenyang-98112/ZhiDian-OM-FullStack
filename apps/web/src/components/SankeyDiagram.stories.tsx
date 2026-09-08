import type { Meta, StoryObj } from '@storybook/react';
import type { EnergyData } from '../types';
import { SankeyDiagram } from './SankeyDiagram';

const mockData: EnergyData = {
  pvPower: 4200,
  gridPower: -1200,
  batteryPower: -800,
  houseLoad: 2200,
  batterySoC: 68,
  heatPumpPower: 650,
  evPower: 350,
  gridVoltage: 231,
  batteryVoltage: 51.2,
  pvYieldToday: 22.5,
  priceCurrent: 0.195,
};

const meta: Meta<typeof SankeyDiagram> = {
  title: 'Energy/SankeyDiagram',
  component: SankeyDiagram,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[520px] w-full max-w-4xl p-4">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SankeyDiagram>;

export const DaytimePVSurplus: Story = {
  args: { data: mockData },
};

export const EveningGridImport: Story = {
  args: {
    data: {
      ...mockData,
      pvPower: 0,
      gridPower: 2800,
      batteryPower: 400,
      houseLoad: 3200,
      batterySoC: 42,
    },
  },
};

export const NightBatteryDischarge: Story = {
  args: {
    data: {
      ...mockData,
      pvPower: 0,
      gridPower: 0,
      batteryPower: 1500,
      houseLoad: 1500,
      batterySoC: 35,
      heatPumpPower: 0,
      evPower: 0,
    },
  },
};
