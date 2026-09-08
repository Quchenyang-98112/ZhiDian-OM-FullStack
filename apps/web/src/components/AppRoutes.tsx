import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageSkeleton } from './ui/Skeleton';

const CommandHubLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.CommandHubLayout })),
);
const LiveEnergyLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.LiveEnergyLayout })),
);
const DevicesLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.DevicesLayout })),
);
const OptimizationLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.OptimizationLayout })),
);
const AnalyticsLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.AnalyticsLayout })),
);
const MonitoringLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.MonitoringLayout })),
);
const SettingsLayout = lazy(() =>
  import('./layout/SectionLayouts').then((m) => ({ default: m.SettingsLayout })),
);

const AgentCollaboration = lazy(() => import('../pages/AgentCollaboration'));
const MonitoringAgentPage = lazy(() =>
  import('../pages/AgentDetailPages').then((m) => ({ default: m.MonitoringAgentPage })),
);
const DiagnosisAgentPage = lazy(() =>
  import('../pages/AgentDetailPages').then((m) => ({ default: m.DiagnosisAgentPage })),
);
const DecisionAgentPage = lazy(() =>
  import('../pages/AgentDetailPages').then((m) => ({ default: m.DecisionAgentPage })),
);
const KnowledgeBasePage = lazy(() => import('../pages/KnowledgeBasePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const CarbonReductionPage = lazy(() => import('../pages/CarbonReductionPage'));
const EnergyAbsorptionPage = lazy(() => import('../pages/EnergyAbsorptionPage'));
const ChineseSettingsPage = lazy(() =>
  import('../pages/ChineseSystemPages').then((m) => ({ default: m.ChineseSettingsPage })),
);
const ChineseAiSettingsPage = lazy(() =>
  import('../pages/ChineseSystemPages').then((m) => ({ default: m.ChineseAiSettingsPage })),
);
const ChineseHardwarePage = lazy(() =>
  import('../pages/ChineseSystemPages').then((m) => ({ default: m.ChineseHardwarePage })),
);
const ChinesePluginsPage = lazy(() =>
  import('../pages/ChineseSystemPages').then((m) => ({ default: m.ChinesePluginsPage })),
);
const ChineseHelpPage = lazy(() =>
  import('../pages/ChineseSystemPages').then((m) => ({ default: m.ChineseHelpPage })),
);
const ChineseTariffsPage = lazy(() =>
  import('../pages/ChineseSystemPages').then((m) => ({ default: m.ChineseTariffsPage })),
);
const PowerPlantOverview = lazy(() =>
  import('../pages/PowerPlantPages').then((m) => ({ default: m.PowerPlantOverview })),
);
const PowerPlantRealtime = lazy(() =>
  import('../pages/PowerPlantPages').then((m) => ({ default: m.PowerPlantRealtime })),
);
const PowerPlantDevices = lazy(() =>
  import('../pages/PowerPlantPages').then((m) => ({ default: m.PowerPlantDevices })),
);
const PowerPlantAnalytics = lazy(() =>
  import('../pages/PowerPlantPages').then((m) => ({ default: m.PowerPlantAnalytics })),
);
const PowerPlantMonitoring = lazy(() =>
  import('../pages/PowerPlantPages').then((m) => ({ default: m.PowerPlantMonitoring })),
);

/** Primary SPA route table (7 sections + legacy redirects). */
export const AppRoutes = () => (
  // skipcq: JS-0415 — flat route table; depth is structural, not nested UI logic
  <Suspense fallback={<PageSkeleton />}>
    <Routes>
      <Route element={<CommandHubLayout />}>
        <Route path="/" element={<PowerPlantOverview />} />
      </Route>
      <Route element={<LiveEnergyLayout />}>
        <Route path="/energy-flow" element={<PowerPlantRealtime />} />
      </Route>
      <Route element={<DevicesLayout />}>
        <Route path="/devices" element={<PowerPlantDevices />} />
      </Route>
      <Route element={<OptimizationLayout />}>
        <Route path="/optimization-ai" element={<Navigate to="/agent-collaboration" replace />} />
        <Route path="/agent-collaboration" element={<AgentCollaboration />} />
        <Route path="/agent-collaboration/monitoring" element={<MonitoringAgentPage />} />
        <Route path="/agent-collaboration/diagnosis" element={<DiagnosisAgentPage />} />
        <Route path="/agent-collaboration/decision" element={<DecisionAgentPage />} />
        <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="/tariffs" element={<ChineseTariffsPage />} />
      </Route>
      <Route element={<AnalyticsLayout />}>
        <Route path="/analytics" element={<PowerPlantAnalytics />} />
        <Route path="/carbon-reduction" element={<CarbonReductionPage />} />
        <Route path="/energy-absorption" element={<EnergyAbsorptionPage />} />
      </Route>
      <Route element={<MonitoringLayout />}>
        <Route path="/monitoring" element={<PowerPlantMonitoring />} />
      </Route>
      <Route element={<SettingsLayout />}>
        <Route path="/settings" element={<ChineseSettingsPage />} />
        <Route path="/settings/ai" element={<ChineseAiSettingsPage />} />
        <Route path="/settings/hardware" element={<ChineseHardwarePage />} />
        <Route path="/plugins" element={<ChinesePluginsPage />} />
        <Route path="/help" element={<ChineseHelpPage />} />
      </Route>
      <Route path="/production" element={<Navigate to="/energy-flow" replace />} />
      <Route path="/storage" element={<Navigate to="/energy-flow" replace />} />
      <Route path="/consumption" element={<Navigate to="/energy-flow" replace />} />
      <Route path="/ev" element={<Navigate to="/devices" replace />} />
      <Route path="/floorplan" element={<Navigate to="/devices" replace />} />
      <Route path="/controllers" element={<Navigate to="/settings" replace />} />
      <Route path="/hardware" element={<Navigate to="/settings/hardware" replace />} />
      <Route path="/historical-analytics" element={<Navigate to="/analytics" replace />} />
      <Route path="/ai-optimizer" element={<Navigate to="/agent-collaboration" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);
