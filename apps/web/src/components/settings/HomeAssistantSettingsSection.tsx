import { Home } from 'lucide-react';
import type { AdapterSettingsSectionProps } from '../../core/adapters/settings-section-registry';
import { useHomeAssistantSettingsForm } from '../../lib/use-home-assistant-settings-form';
import { HaSettingsPanelBody } from './HaSettingsPanelBody';

export const HomeAssistantSettingsSection = ({ isReadOnly }: AdapterSettingsSectionProps) => {
  const form = useHomeAssistantSettingsForm({ isReadOnly });
  const sectionClass = 'glass-panel-strong space-y-6 rounded-2xl p-6';
  const sectionHeaderClass =
    'flex items-center gap-2 border-b border-(--color-border) pb-4 text-lg font-medium fluid-text-lg';

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Home size={20} className="text-orange-400" aria-hidden="true" />
        {form.t('settings.haTitle')}
      </h2>
      <p className="text-(--color-muted) text-sm">{form.t('settings.haDescription')}</p>
      <HaSettingsPanelBody form={form} />
    </section>
  );
};
