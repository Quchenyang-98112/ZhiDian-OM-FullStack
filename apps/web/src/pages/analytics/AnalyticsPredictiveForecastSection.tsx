import { motion } from 'motion/react';
import { PredictiveForecast } from '../../components/PredictiveForecast';

export const AnalyticsPredictiveForecastSection = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.46 }}
  >
    <PredictiveForecast />
  </motion.div>
);
