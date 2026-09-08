import type { Meta, StoryObj } from '@storybook/react';
import { ConfirmDialog } from './ConfirmDialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Open: Story = {
  args: {
    open: true,
    title: 'System zurücksetzen?',
    description:
      'Alle Einstellungen, gespeicherte Adapter-Konfigurationen und AI-Schlüssel werden gelöscht.',
    confirmLabel: 'Zurücksetzen',
    cancelLabel: 'Abbrechen',
    variant: 'danger',
    onConfirm: () => alert('Bestätigt'),
    onCancel: () => alert('Abgebrochen'),
  },
};

export const Info: Story = {
  args: {
    open: true,
    title: 'Einstellungen speichern?',
    description: 'Änderungen werden in localStorage persistiert.',
    confirmLabel: 'Speichern',
    variant: 'default',
    onConfirm: () => alert('Gespeichert'),
    onCancel: () => alert('Abgebrochen'),
  },
};
