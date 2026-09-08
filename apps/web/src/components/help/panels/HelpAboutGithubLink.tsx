import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandGithubIcon } from '../../icons/BrandGithubIcon';

/** External link to the GitHub repository on the Help About tab. */
export const HelpAboutGithubLink = () => {
  const { t } = useTranslation();

  return (
    <a
      href="https://github.com/qnbs/Nexus-HEMS-Dash"
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring mb-6 inline-flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 font-medium text-sm transition-all duration-200 hover:border-(--color-primary)/40 hover:bg-(--color-primary)/10 hover:text-(--color-primary)"
    >
      <BrandGithubIcon size={18} aria-hidden="true" />
      <span>{t('help.githubRepo')}</span>
      <ExternalLink size={14} className="text-(--color-muted)" aria-hidden="true" />
    </a>
  );
};
