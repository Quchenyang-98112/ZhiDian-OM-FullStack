import type { Meta, StoryObj } from '@storybook/react';
import { NeonCard } from './NeonCard';

const meta: Meta<typeof NeonCard> = {
  title: 'UI/NeonCard',
  component: NeonCard,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['green', 'blue', 'orange'],
    },
  },
};
export default meta;

type Story = StoryObj<typeof NeonCard>;

export const Green: Story = {
  args: { variant: 'green', children: 'PV-Ertrag: 4.2 kW' },
};

export const Blue: Story = {
  args: { variant: 'blue', children: 'Batterie: 78 %' },
};

export const Orange: Story = {
  args: { variant: 'orange', children: 'Netzeinspeisung: 1.1 kW' },
};
