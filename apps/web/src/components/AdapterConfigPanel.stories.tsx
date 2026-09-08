import type { Meta, StoryObj } from '@storybook/react';
import { AdapterConfigPanel } from './AdapterConfigPanel';

const meta: Meta<typeof AdapterConfigPanel> = {
  title: 'Settings/AdapterConfigPanel',
  component: AdapterConfigPanel,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-4">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AdapterConfigPanel>;

export const Default: Story = {};
