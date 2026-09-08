import type { Meta, StoryObj } from '@storybook/react';
import { ToggleSwitch } from './ToggleSwitch';

const meta: Meta<typeof ToggleSwitch> = {
  title: 'Settings/ToggleSwitch',
  component: ToggleSwitch,
  tags: ['autodocs'],
  args: { label: 'Enable feature', id: 'sb-toggle' },
  argTypes: { onChange: { action: 'changed' } },
};
export default meta;

type Story = StoryObj<typeof ToggleSwitch>;

export const Off: Story = {
  args: { checked: false },
};

export const On: Story = {
  args: { checked: true },
};
