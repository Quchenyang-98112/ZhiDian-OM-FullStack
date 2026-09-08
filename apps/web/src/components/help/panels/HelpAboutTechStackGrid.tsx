import { useTranslation } from 'react-i18next';
import { HelpTechStackCard } from './HelpTechStackCard';

/** Technology stack grid on the Help About tab. */
export const HelpAboutTechStackGrid = ({
  techStack,
}: {
  techStack: { category: string; items: string }[];
}) => {
  const { t } = useTranslation();

  return (
    <div className="border-(--color-border) border-t pt-6">
      <h3 className="mb-4 font-medium">{t('help.techStack')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {techStack.map((tech) => (
          <HelpTechStackCard key={tech.category} {...tech} />
        ))}
      </div>
    </div>
  );
};
