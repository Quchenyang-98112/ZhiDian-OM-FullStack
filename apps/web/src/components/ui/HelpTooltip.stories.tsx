import type { Meta, StoryObj } from '@storybook/react';
import { HelpTooltip } from './HelpTooltip';

const meta: Meta<typeof HelpTooltip> = {
  title: 'UI/HelpTooltip',
  component: HelpTooltip,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex min-h-[120px] items-center justify-center p-12">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HelpTooltip>;

export const Default: Story = {
  args: {
    content: 'Live-Kennzahlen zeigen PV-Erzeugung, Batteriestatus und Netzleistung.',
  },
};

export const SideRight: Story = {
  args: {
    content: 'Klicke auf eine Kachel, um direkt zum entsprechenden Bereich zu springen.',
    side: 'right',
  },
};

export const SideBottom: Story = {
  args: {
    content: 'Zeigt erweiterte Metriken und Adapter-Logs.',
    side: 'bottom',
  },
};

export const LargeIcon: Story = {
  args: {
    content: 'Größeres Hilfe-Icon für prominentere Platzierung.',
    size: 20,
  },
};
