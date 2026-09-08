import type { Meta, StoryObj } from '@storybook/react';
import { PWAInstallPrompt } from './PWAInstallPrompt';

const meta: Meta<typeof PWAInstallPrompt> = {
  title: 'Components/PWAInstallPrompt',
  component: PWAInstallPrompt,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof PWAInstallPrompt>;

export const Default: Story = {};
