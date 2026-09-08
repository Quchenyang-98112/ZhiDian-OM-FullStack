import { ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Feature highlight card used on the Help features tab. */
export const HelpFeatureCard = ({
  icon,
  title,
  description,
  color,
  link,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  link?: string;
}) => {
  const { t } = useTranslation();

  const content = (
    <motion.div
      className={`glass-panel rounded-xl border border-(--color-border) p-5 transition-all hover:border-(--color-primary)/30 ${link ? 'cursor-pointer' : ''}`}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <h3 className="mb-1 font-semibold text-sm">{title}</h3>
      <p className="text-(--color-muted) text-xs leading-relaxed">{description}</p>
      {link && (
        <span className="mt-2 inline-flex items-center gap-1 font-medium text-(--color-primary) text-[10px]">
          <ExternalLink size={10} aria-hidden="true" />
          {t('help.openLink')}
        </span>
      )}
    </motion.div>
  );

  if (link) {
    return (
      <Link to={link} className="focus-ring block rounded-xl">
        {content}
      </Link>
    );
  }
  return content;
};
