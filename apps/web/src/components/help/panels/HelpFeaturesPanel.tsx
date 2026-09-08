import {
  Activity,
  BarChart3,
  Battery,
  Car,
  Clock,
  Cpu,
  Gauge,
  HardDrive,
  Home,
  Map as MapIcon,
  Network,
  Shield,
  Sparkles,
  Sun,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpFeatureCard } from '../HelpFeatureCard';
import { HelpTabPanelShell } from '../HelpTabPanelShell';

export const HelpFeaturesPanel = () => {
  const { t } = useTranslation();

  return (
    <HelpTabPanelShell tabKey="features">
      <div className="glass-panel-strong rounded-2xl p-6">
        <h2 className="mb-6 font-semibold text-xl">{t('help.allFeatures')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HelpFeatureCard
            icon={<Activity size={20} className="text-emerald-400" />}
            title={t('help.featureSankey')}
            description={t('help.featureSankeyDesc')}
            color="bg-emerald-500/15"
            link="/energy-flow"
          />
          <HelpFeatureCard
            icon={<MapIcon size={20} className="text-blue-400" />}
            title={t('help.featureFloorplan')}
            description={t('help.featureFloorplanDesc')}
            color="bg-blue-500/15"
            link="/devices"
          />
          <HelpFeatureCard
            icon={<Sparkles size={20} className="text-purple-400" />}
            title={t('help.featureAI')}
            description={t('help.featureAIDesc')}
            color="bg-purple-500/15"
            link="/optimization-ai"
          />
          <HelpFeatureCard
            icon={<Car size={20} className="text-amber-400" />}
            title={t('help.featureEV')}
            description={t('help.featureEVDesc')}
            color="bg-amber-500/15"
            link="/devices"
          />
          <HelpFeatureCard
            icon={<TrendingUp size={20} className="text-rose-400" />}
            title={t('help.featureTariffs')}
            description={t('help.featureTariffsDesc')}
            color="bg-rose-500/15"
            link="/tariffs"
          />
          <HelpFeatureCard
            icon={<Sun size={20} className="text-yellow-400" />}
            title={t('help.featureForecast')}
            description={t('help.featureForecastDesc')}
            color="bg-yellow-500/15"
            link="/energy-flow"
          />
          <HelpFeatureCard
            icon={<Battery size={20} className="text-green-400" />}
            title={t('help.featureBattery')}
            description={t('help.featureBatteryDesc')}
            color="bg-green-500/15"
            link="/energy-flow"
          />
          <HelpFeatureCard
            icon={<BarChart3 size={20} className="text-indigo-400" />}
            title={t('help.featureAnalytics')}
            description={t('help.featureAnalyticsDesc')}
            color="bg-indigo-500/15"
            link="/analytics"
          />
          <HelpFeatureCard
            icon={<Home size={20} className="text-teal-400" />}
            title={t('help.featureHA')}
            description={t('help.featureHADesc')}
            color="bg-teal-500/15"
            link="/plugins"
          />
          <HelpFeatureCard
            icon={<Gauge size={20} className="text-slate-400" />}
            title={t('help.featureMonitoring')}
            description={t('help.featureMonitoringDesc')}
            color="bg-slate-500/15"
            link="/monitoring"
          />
          <HelpFeatureCard
            icon={<WifiOff size={20} className="text-orange-400" />}
            title={t('help.featureOffline')}
            description={t('help.featureOfflineDesc')}
            color="bg-orange-500/15"
          />
          <HelpFeatureCard
            icon={<Shield size={20} className="text-red-400" />}
            title={t('help.featureSecurity')}
            description={t('help.featureSecurityDesc')}
            color="bg-red-500/15"
          />
          <HelpFeatureCard
            icon={<Cpu size={20} className="text-cyan-400" />}
            title={t('help.featureControllers')}
            description={t('help.featureControllersDesc')}
            color="bg-cyan-500/15"
            link="/devices"
          />
          <HelpFeatureCard
            icon={<Network size={20} className="text-violet-400" />}
            title={t('help.featurePlugins')}
            description={t('help.featurePluginsDesc')}
            color="bg-violet-500/15"
            link="/plugins"
          />
          <HelpFeatureCard
            icon={<HardDrive size={20} className="text-lime-400" />}
            title={t('help.featureHardwareRegistry')}
            description={t('help.featureHardwareRegistryDesc')}
            color="bg-lime-500/15"
            link="/settings/hardware"
          />
          <HelpFeatureCard
            icon={<Clock size={20} className="text-sky-400" />}
            title={t('help.featureHistorical')}
            description={t('help.featureHistoricalDesc')}
            color="bg-sky-500/15"
            link="/analytics"
          />
        </div>
      </div>

      {/* Supported Protocols */}
      <div className="glass-panel-strong rounded-2xl p-6">
        <h3 className="mb-4 font-medium text-lg">{t('help.protocols')}</h3>
        <div className="flex flex-wrap gap-2">
          {(
            [
              'help.protocolVictron',
              'help.protocolModbus',
              'help.protocolKnx',
              'help.protocolOcpp',
              'help.protocolEebus',
              'help.protocolEvcc',
              'help.protocolOpenEms',
              'help.protocolHa',
              'help.protocolMatter',
              'help.protocolZigbee',
              'help.protocolShelly',
              'help.protocolOpenAdr',
              'help.protocolExec',
              'help.protocolMqttWs',
              'help.protocolSgReady',
              'help.protocolTariffs',
            ] as const
          ).map((key) => (
            <span
              key={key}
              className="rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1.5 font-medium text-xs"
            >
              {t(key)}
            </span>
          ))}
        </div>
      </div>
    </HelpTabPanelShell>
  );
};
