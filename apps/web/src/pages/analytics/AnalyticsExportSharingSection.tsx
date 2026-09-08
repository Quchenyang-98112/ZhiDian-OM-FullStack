import { motion } from 'motion/react';
import { ExportAndSharing } from '../../components/ExportAndSharing';

export const AnalyticsExportSharingSection = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.48 }}
  >
    <ExportAndSharing />
  </motion.div>
);
