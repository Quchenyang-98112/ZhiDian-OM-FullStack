import type { Meta, StoryObj } from '@storybook/react';
import { Floorplan } from './Floorplan';

const meta: Meta<typeof Floorplan> = {
  title: 'Devices/Floorplan',
  component: Floorplan,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-4">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Floorplan>;

export const Default: Story = {};
