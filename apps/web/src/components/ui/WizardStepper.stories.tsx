import type { Meta, StoryObj } from '@storybook/react';
import { CheckCircle2, Cpu, Settings } from 'lucide-react';
import { useState } from 'react';
import { useWizard, WizardContent, type WizardStepDef, WizardStepper } from './WizardStepper';

const DEMO_STEPS: WizardStepDef[] = [
  { id: 'configure', label: 'Konfigurieren', icon: <Settings size={14} aria-hidden="true" /> },
  { id: 'process', label: 'Verarbeiten', icon: <Cpu size={14} aria-hidden="true" /> },
  { id: 'done', label: 'Fertig', icon: <CheckCircle2 size={14} aria-hidden="true" /> },
];

const meta: Meta<typeof WizardStepper> = {
  title: 'UI/WizardStepper',
  component: WizardStepper,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof WizardStepper>;

export const Default: Story = {
  args: { steps: DEMO_STEPS, currentStep: 0 },
};

export const SecondStep: Story = {
  args: { steps: DEMO_STEPS, currentStep: 1 },
};

export const Completed: Story = {
  args: { steps: DEMO_STEPS, currentStep: 2 },
};

function InteractiveDemo() {
  const [step, setStep] = useState(0);
  const { canGoBack, canGoForward } = useWizard(DEMO_STEPS.length);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <WizardStepper steps={DEMO_STEPS} currentStep={step} onStepClick={setStep} />
      <WizardContent currentStep={step}>
        <div className="glass-panel rounded-xl p-6 text-center">Schritt 1 — Konfiguration</div>
        <div className="glass-panel rounded-xl p-6 text-center">Schritt 2 — Verarbeitung</div>
        <div className="glass-panel rounded-xl p-6 text-center">Schritt 3 — Abgeschlossen ✓</div>
      </WizardContent>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          disabled={!canGoBack(step)}
          onClick={() => setStep((s) => s - 1)}
          className="focus-ring rounded-lg bg-(--color-primary)/15 px-4 py-2 font-medium text-(--color-primary) text-sm disabled:opacity-40"
        >
          Zurück
        </button>
        <button
          type="button"
          disabled={!canGoForward(step)}
          onClick={() => setStep((s) => s + 1)}
          className="focus-ring rounded-lg bg-(--color-primary)/15 px-4 py-2 font-medium text-(--color-primary) text-sm disabled:opacity-40"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
};
