import type { Meta, StoryObj } from '@storybook/react';
import { EnergyCard } from './EnergyCard';
import { LiveMetric } from './LiveMetric';

const meta: Meta<typeof EnergyCard> = {
  title: 'UI/EnergyCard',
  component: EnergyCard,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'success', 'warning', 'danger', 'neutral'],
    },
    defaultExpanded: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md p-8">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof EnergyCard>;

export const Default: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <span className="eyebrow">PV-Erzeugung</span>
        <LiveMetric value={3.247} unit="kW" />
      </>
    ),
    details: <p className="text-(--color-muted) text-sm">+12 % gegenüber gestern</p>,
  },
};

export const Expanded: Story = {
  args: {
    variant: 'success',
    defaultExpanded: true,
    children: (
      <>
        <span className="eyebrow">Batterie</span>
        <LiveMetric value={78} unit="%" />
      </>
    ),
    details: (
      <div className="space-y-1 text-(--color-muted) text-sm">
        <p>Laden · 1.4 kW</p>
        <p>ETA 14:30</p>
      </div>
    ),
  },
};

export const NoDetails: Story = {
  args: {
    variant: 'warning',
    children: (
      <>
        <span className="eyebrow">Netzeinspeisung</span>
        <LiveMetric value={1.12} unit="kW" />
      </>
    ),
  },
};
