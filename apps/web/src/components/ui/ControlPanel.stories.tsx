import type { Meta, StoryObj } from '@storybook/react';
import { ControlPanel, ControlPanelDivider, ControlPanelSection } from './ControlPanel';

const meta: Meta<typeof ControlPanel> = {
  title: 'UI/ControlPanel',
  component: ControlPanel,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-8">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ControlPanel>;

export const Default: Story = {
  args: {
    title: 'Adapter-Konfiguration',
    children: (
      <>
        <ControlPanelSection title="Verbindung">
          <div className="glass-panel p-4 text-(--color-text) text-sm">
            Host: 192.168.1.100 · Port: 502
          </div>
        </ControlPanelSection>
        <ControlPanelDivider />
        <ControlPanelSection title="Polling">
          <div className="glass-panel p-4 text-(--color-text) text-sm">
            Intervall: 5 s · Timeout: 3 s
          </div>
        </ControlPanelSection>
      </>
    ),
  },
};

export const WithClose: Story = {
  args: {
    title: 'Victron Cerbo GX',
    onClose: () => alert('Geschlossen'),
    closeLabel: 'Panel schließen',
    children: <p className="text-(--color-muted) text-sm">Detailansicht des Adapters</p>,
  },
};

export const WithHeaderActions: Story = {
  args: {
    title: 'KNX-Steuerung',
    headerActions: (
      <button className="btn-secondary text-xs" type="button">
        Zurücksetzen
      </button>
    ),
    onClose: () => alert('Geschlossen'),
    children: <p className="text-(--color-muted) text-sm">Formularfelder, Schalter, etc.</p>,
  },
};
