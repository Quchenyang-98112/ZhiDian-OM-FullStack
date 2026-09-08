import type { Meta, StoryObj } from '@storybook/react';
import { ErrorBoundary } from './ErrorBoundary';

const ThrowError = () => {
  throw new Error('Test-Fehler für Storybook');
};

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof ErrorBoundary>;

export const WithError: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  ),
};

export const WithoutError: Story = {
  render: () => (
    <ErrorBoundary>
      <div className="p-4 text-white">Alles funktioniert einwandfrei.</div>
    </ErrorBoundary>
  ),
};
