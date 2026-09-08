import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FloatingActionBar } from './FloatingActionBar';

const meta: Meta<typeof FloatingActionBar> = {
  title: 'UI/FloatingActionBar',
  component: FloatingActionBar,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="relative h-[300px] p-8">
        <p className="text-(--color-muted) text-sm">Inhaltsbereich — Aktionsleiste unten</p>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FloatingActionBar>;

export const Default: Story = {
  args: {
    open: true,
    primaryAction: (
      <button className="btn-primary" type="button">
        Speichern
      </button>
    ),
    secondaryAction: (
      <button className="btn-secondary" type="button">
        Zurücksetzen
      </button>
    ),
    ariaLabel: 'Aktionen',
  },
};

export const PrimaryOnly: Story = {
  args: {
    open: true,
    primaryAction: (
      <button className="btn-primary" type="button">
        Übernehmen
      </button>
    ),
    ariaLabel: 'Aktionen',
  },
};

function ToggleDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary" type="button" onClick={() => setOpen((o) => !o)}>
        {open ? 'Ausblenden' : 'Einblenden'}
      </button>
      <FloatingActionBar
        open={open}
        onDismiss={() => setOpen(false)}
        primaryAction={
          <button className="btn-primary" type="button" onClick={() => setOpen(false)}>
            Speichern
          </button>
        }
        secondaryAction={
          <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>
            Verwerfen
          </button>
        }
        ariaLabel="Änderungs-Aktionen"
      />
    </>
  );
}

export const Interactive: Story = {
  render: () => <ToggleDemo />,
};
