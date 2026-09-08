import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { wizardStep } from '../../design-tokens';

// ─── Types ───────────────────────────────────────────────────────────

export interface WizardStepDef {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface WizardStepperProps {
  steps: WizardStepDef[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}

export interface WizardContentProps {
  currentStep: number;
  children: ReactNode[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useWizard(totalSteps: number) {
  // We rely on the caller managing state with useState, since React
  // Compiler handles memoization. Return convenience callbacks only.
  return {
    canGoBack: (step: number) => step > 0,
    canGoForward: (step: number) => step < totalSteps - 1,
    isLastStep: (step: number) => step === totalSteps - 1,
  };
}

// ─── Step Indicator Bar ──────────────────────────────────────────────

export function WizardStepper({ steps, currentStep, onStepClick }: WizardStepperProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('wizard.stepsNavLabel')}
      className="flex items-center justify-center"
      style={{ gap: wizardStep.gap }}
    >
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isClickable = onStepClick && i <= currentStep;

        return (
          <div key={step.id} className="flex items-center gap-3">
            {/* Connector line */}
            {i > 0 && (
              <div
                className="hidden h-0.5 w-8 sm:block"
                style={{
                  background: isCompleted ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              />
            )}

            <button
              type="button"
              onClick={isClickable ? () => onStepClick(i) : undefined}
              disabled={!isClickable}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={t('wizard.stepLabel', {
                label: step.label,
                current: i + 1,
                total: steps.length,
              })}
              className={`focus-ring flex items-center gap-2 rounded-full px-3 py-1.5 font-medium text-sm transition-colors ${
                isCurrent
                  ? 'border border-(--color-primary)/40 bg-(--color-primary)/15 text-(--color-primary)'
                  : isCompleted
                    ? 'bg-(--color-primary)/10 text-(--color-primary)'
                    : 'text-(--color-muted)'
              } ${isClickable ? 'cursor-pointer hover:bg-(--color-primary)/20' : 'cursor-default'}`}
            >
              <span
                className="flex items-center justify-center rounded-full font-bold text-xs"
                style={{
                  width: wizardStep.indicatorSize,
                  height: wizardStep.indicatorSize,
                  border: `${wizardStep.indicatorBorderWidth} solid ${
                    isCurrent || isCompleted ? 'var(--color-primary)' : 'var(--color-border)'
                  }`,
                  background: isCompleted ? 'var(--color-primary)' : 'transparent',
                  color: isCompleted ? 'var(--color-background)' : undefined,
                }}
              >
                {isCompleted ? <Check size={14} aria-hidden="true" /> : step.icon}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

// ─── Animated Step Content ───────────────────────────────────────────

export function WizardContent({ currentStep, children }: WizardContentProps) {
  return (
    <div className="relative" style={{ minHeight: wizardStep.contentMinHeight }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {children[currentStep]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
