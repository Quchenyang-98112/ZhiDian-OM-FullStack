import type { Meta, StoryObj } from '@storybook/react';
import { PWAUpdateNotification } from './PWAUpdateNotification';

const meta: Meta<typeof PWAUpdateNotification> = {
  title: 'Components/PWAUpdateNotification',
  component: PWAUpdateNotification,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof PWAUpdateNotification>;

export const Default: Story = {};
