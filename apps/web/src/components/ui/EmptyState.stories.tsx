import type { Meta, StoryObj } from '@storybook/react';
import { Inbox, Search, WifiOff } from 'lucide-react';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    icon: { control: false },
    pulse: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: Inbox,
    title: 'Keine Daten verfügbar',
    description: 'Verbinde einen Adapter, um Energiedaten zu sehen.',
  },
};

export const WithPulse: Story = {
  args: {
    icon: WifiOff,
    title: 'Keine Verbindung',
    description: 'Verbinden Sie Ihren Wechselrichter oder Cerbo GX.',
    pulse: true,
  },
};

export const WithAction: Story = {
  args: {
    icon: Search,
    title: 'Keine Ergebnisse',
    description: 'Versuchen Sie einen anderen Suchbegriff.',
    pulse: true,
    action: (
      <button
        type="button"
        className="rounded-xl bg-(--color-primary)/15 px-4 py-2 font-semibold text-(--color-primary) text-xs"
      >
        Filter zurücksetzen
      </button>
    ),
  },
};
