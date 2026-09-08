import type { Meta, StoryObj } from '@storybook/react';
import { Gauge } from './Gauge';

const meta: Meta<typeof Gauge> = {
  title: 'UI/Gauge',
  component: Gauge,
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    label: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Gauge>;

export const Default: Story = {
  args: { value: 72, label: 'SoC', unit: '%' },
};

export const Low: Story = {
  args: { value: 15, label: 'Batterie', unit: '%' },
};

export const Full: Story = {
  args: { value: 100, label: 'Voll', unit: '%' },
};
