import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { DemoBadge } from '../components/DemoBadge';
import { PageHeader } from '../components/layout/PageHeader';
import {
  OptimizationAnalyseStep,
  OptimizationConfirmStep,
  OptimizationOverviewCards,
  OptimizationSuggestionsStep,
  useOptimizationWizard,
} from '../components/optimization';
import { EmptyState } from '../components/ui/EmptyState';
import { FloatingActionBar } from '../components/ui/FloatingActionBar';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';
import { WizardContent, type WizardStepDef, WizardStepper } from '../components/ui/WizardStepper';

export default function OptimizationAI() {
  const {
    t,
    energyData,
    isDemo,
    wizardOpen,
    step,
    setStep,
    loading,
    recommendations,
    aiRecommendation,
    applied,
    wizard,
    chartData,
    hasData,
    handleStart,
    handleNext,
    handleBack,
    handleClose,
  } = useOptimizationWizard();

  const steps: WizardStepDef[] = [
    { id: 'analyse', label: t('optimizationWizard.step1Title'), icon: <BarChart3 size={14} /> },
    {
      id: 'suggestions',
      label: t('optimizationWizard.step2Title'),
      icon: <BrainCircuit size={14} />,
    },
    { id: 'confirm', label: t('optimizationWizard.step3Title'), icon: <CheckCircle2 size={14} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        mobileSticky
        title={t('optimizationWizard.pageTitle')}
        subtitle={t('optimizationWizard.pageSubtitle')}
        icon={<Sparkles size={22} />}
        actions={
          <>
            {isDemo && <DemoBadge />}
            <HelpTooltip content={t('tour.optimization.help')} />
          </>
        }
      />

      {!hasData && !wizardOpen && (
        <EmptyState
          icon={Sparkles}
          title={t('empty.noEnergyData')}
          description={t('tour.optimization.emptyDesc')}
          pulse
        />
      )}

      <OptimizationOverviewCards energyData={energyData} />

      {wizardOpen && (
        <motion.section
          className="glass-panel-strong rounded-3xl p-6"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          aria-label={t('optimizationWizard.pageTitle')}
        >
          <div className="mb-6">
            <WizardStepper
              steps={steps}
              currentStep={step}
              onStepClick={(i) => i < step && setStep(i)}
            />
          </div>

          <WizardContent currentStep={step}>
            <OptimizationAnalyseStep loading={loading} chartData={chartData} />
            <OptimizationSuggestionsStep
              aiRecommendation={aiRecommendation}
              recommendations={recommendations}
            />
            <OptimizationConfirmStep
              applied={applied}
              aiRecommendation={aiRecommendation}
              recommendations={recommendations}
            />
          </WizardContent>

          {!applied && (
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={wizard.canGoBack(step) ? handleBack : handleClose}
                className="focus-ring flex items-center gap-1.5 rounded-xl px-4 py-2 font-medium text-(--color-muted) text-sm transition-colors hover:text-(--color-text)"
              >
                <ArrowLeft size={16} />
                {wizard.canGoBack(step)
                  ? t('optimizationWizard.back')
                  : t('optimizationWizard.cancel')}
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="focus-ring flex items-center gap-1.5 rounded-xl bg-(--color-text) px-5 py-2 font-semibold text-(--color-background) text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {wizard.isLastStep(step) ? (
                  <>
                    <CheckCircle2 size={16} />
                    {t('optimizationWizard.apply')}
                  </>
                ) : (
                  <>
                    {t('optimizationWizard.next')}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}
        </motion.section>
      )}

      <PageCrossLinks />

      <FloatingActionBar
        open={!wizardOpen}
        ariaLabel={t('optimizationWizard.pageTitle')}
        primaryAction={
          <button
            type="button"
            onClick={handleStart}
            className="focus-ring flex items-center gap-2 rounded-full bg-(--color-text) px-5 py-2.5 font-semibold text-(--color-background) text-sm transition-opacity hover:opacity-90"
          >
            <Sparkles size={16} />
            {t('ai.optimizeNow')}
          </button>
        }
      />
    </div>
  );
}
