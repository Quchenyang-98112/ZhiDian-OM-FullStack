import { ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AIOptimizerPanel } from '../../AIOptimizerPanel';

/** "AI recommendation of the day" section wrapping the shared optimizer panel. */
export function AiRecommendationSection() {
  const { t } = useTranslation();
  return (
    <motion.section
      aria-labelledby="hub-ai-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="hub-ai-title" className="fluid-text-base flex items-center gap-2 font-medium">
          <Sparkles size={18} className="text-purple-400" aria-hidden="true" />
          {t('commandHub.aiRecommendation')}
        </h2>
        <Link
          to="/optimization-ai"
          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-(--color-primary) text-xs transition-colors hover:bg-(--color-primary)/10"
        >
          {t('commandHub.allRecommendations')}
          <ChevronRight size={14} />
        </Link>
      </div>
      <div id="ai-optimizer">
        <AIOptimizerPanel />
      </div>
    </motion.section>
  );
}
