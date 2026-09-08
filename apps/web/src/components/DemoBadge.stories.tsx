import type { Meta, StoryObj } from '@storybook/react';
import { DemoBadge } from './DemoBadge';

const meta: Meta<typeof DemoBadge> = {
  title: 'Components/DemoBadge',
  component: DemoBadge,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof DemoBadge>;

export const Default: Story = {};
