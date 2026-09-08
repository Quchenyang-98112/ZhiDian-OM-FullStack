import type { Meta, StoryObj } from '@storybook/react';
import { LiveMetric } from './LiveMetric';

const meta: Meta<typeof LiveMetric> = {
  title: 'UI/LiveMetric',
  component: LiveMetric,
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 10, step: 0.001 } },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] },
    format: { control: 'select', options: ['power', 'energy', 'percent', 'currency', 'custom'] },
    pulse: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof LiveMetric>;

export const Power: Story = {
  args: { value: 3.247, unit: 'kW', format: 'power', size: 'lg' },
};

export const Percent: Story = {
  args: { value: 78, unit: '%', format: 'percent', size: 'md' },
};

export const Currency: Story = {
  args: { value: 0.182, unit: '€/kWh', format: 'currency', size: 'sm' },
};

export const Large: Story = {
  args: { value: 12.456, unit: 'kWh', format: 'energy', size: 'xl' },
};
