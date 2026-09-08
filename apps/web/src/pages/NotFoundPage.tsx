import { AlertTriangle, Home } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        className="glass-panel-strong max-w-md p-8 text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
          <AlertTriangle size={32} className="text-orange-400" aria-hidden="true" />
        </div>
        <h1 className="fluid-text-2xl mb-2 font-semibold">
          {t('error.pageNotFound', '404 – Page not found')}
        </h1>
        <p className="mb-6 text-(--color-muted)">
          {t('error.pageNotFoundDesc', 'The requested page could not be found.')}
        </p>
        <Link
          to="/"
          className="btn-primary focus-ring inline-flex items-center gap-2 rounded-xl px-6 py-3"
        >
          <Home size={18} />
          {t('error.goHome', 'Go to Dashboard')}
        </Link>
      </motion.div>
    </div>
  );
}
