import type { Meta, StoryObj } from '@storybook/react';
import { LivePriceWidget } from './LivePriceWidget';

const meta: Meta<typeof LivePriceWidget> = {
  title: 'Components/LivePriceWidget',
  component: LivePriceWidget,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof LivePriceWidget>;

export const Default: Story = {};
