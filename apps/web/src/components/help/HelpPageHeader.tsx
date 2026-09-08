import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../layout/PageHeader';

/** Standalone Help page title block (hidden when embedded in Settings). */
export const HelpPageHeader = () => {
  const { t } = useTranslation();

  return (
    <PageHeader
      title={t('help.title')}
      subtitle={t('help.subtitle')}
      icon={<HelpCircle size={22} aria-hidden="true" />}
    />
  );
};
