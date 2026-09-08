import { ArrowRight, Cpu, HardDrive, Shield, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { sectionClass, sectionHeaderClass } from './styles';

const COMMAND_SAFETY_LIMITS = [
  { labelKey: 'settings.safetyEvPower', labelDefault: 'EV Power', range: '0–50 kW' },
  {
    labelKey: 'settings.safetyEvCurrent',
    labelDefault: 'EV Current (IEC 61851)',
    range: '0–80 A',
  },
  { labelKey: 'settings.safetyBattPower', labelDefault: 'Battery Power', range: '±25 kW' },
  { labelKey: 'settings.safetySgReady', labelDefault: 'SG Ready Mode', range: '1–4' },
  { labelKey: 'settings.safetyGridLimit', labelDefault: 'Grid Limit (§14a)', range: '0–25 kW' },
  { labelKey: 'settings.safetyKnxTemp', labelDefault: 'KNX Temperature', range: '5–35 °C' },
] as const;

function CommandSafetyRow({ label, range }: { label: string; range: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-(--color-primary) text-xs">{range}</span>
    </div>
  );
}

/** Command safety limits overview for the Controllers settings tab. */
export function ControllersCommandSafetySection() {
  const { t } = useTranslation();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Shield size={20} className="text-amber-400" />
        {t('settings.commandSafety', 'Command Safety Layer')}
      </h2>
      <p className="text-(--color-muted) text-xs">
        {t(
          'settings.commandSafetyHint',
          'All 18 adapter command types are validated with Zod schemas and IEC/EN safety limits. Dangerous commands require user confirmation via dialog.',
        )}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COMMAND_SAFETY_LIMITS.map((item) => (
          <CommandSafetyRow
            key={item.labelKey}
            label={t(item.labelKey, item.labelDefault)}
            range={item.range}
          />
        ))}
      </div>
    </section>
  );
}

type FeatureLinkConfig = {
  to: string;
  icon: typeof Cpu;
  iconClass: string;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
};

const FEATURE_LINKS: FeatureLinkConfig[] = [
  {
    to: '/devices',
    icon: Cpu,
    iconClass: 'text-cyan-400',
    titleKey: 'nav.controllers',
    titleDefault: 'Controllers',
    descKey: 'settings.controllersLinkDesc',
    descDefault: 'Live controller states & outputs',
  },
  {
    to: '/plugins',
    icon: Sparkles,
    iconClass: 'text-purple-400',
    titleKey: 'nav.plugins',
    titleDefault: 'Plugins',
    descKey: 'settings.pluginsLinkDesc',
    descDefault: 'Plugin lifecycle & services',
  },
  {
    to: '/devices',
    icon: HardDrive,
    iconClass: 'text-orange-400',
    titleKey: 'nav.hardware',
    titleDefault: 'Hardware',
    descKey: 'settings.hardwareLinkDesc',
    descDefault: '120+ supported devices',
  },
];

function FeatureLinkCard({ link }: { link: FeatureLinkConfig }) {
  const { t } = useTranslation();
  const Icon = link.icon;

  return (
    <Link
      to={link.to}
      className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-4 transition-all hover:border-(--color-primary)/40 hover:bg-(--color-primary)/5"
    >
      <Icon size={20} className={link.iconClass} />
      <div>
        <p className="font-medium text-sm">{t(link.titleKey, link.titleDefault)}</p>
        <p className="text-(--color-muted) text-xs">{t(link.descKey, link.descDefault)}</p>
      </div>
    </Link>
  );
}

/** Quick links to related feature pages from the Controllers settings tab. */
export function ControllersFeatureLinksSection() {
  const { t } = useTranslation();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <ArrowRight size={20} className="text-violet-400" />
        {t('settings.featurePages', 'Feature Pages')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FEATURE_LINKS.map((link) => (
          <FeatureLinkCard key={`${link.to}-${link.titleKey}`} link={link} />
        ))}
      </div>
    </section>
  );
}
