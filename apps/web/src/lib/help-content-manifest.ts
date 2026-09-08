import type { HelpTab } from './help-types';

/** Glossary term keys shared by HelpLexiconPanel and the help search index. */
export const HELP_GLOSSARY_ENTRIES = [
  { termKey: 'help.hems', descKey: 'help.hemsDesc' },
  { termKey: 'help.ess', descKey: 'help.essDesc' },
  { termKey: 'help.sgReady', descKey: 'help.sgReadyDesc' },
  { termKey: 'help.enwg', descKey: 'help.enwgDesc' },
  { termKey: 'help.knx', descKey: 'help.knxDesc' },
  { termKey: 'help.soc', descKey: 'help.socDesc' },
  { termKey: 'help.glossMppt', descKey: 'help.glossMpptDesc' },
  { termKey: 'help.glossEms', descKey: 'help.glossEmsDesc' },
  { termKey: 'help.glossFeedIn', descKey: 'help.glossFeedInDesc' },
  { termKey: 'help.glossSector', descKey: 'help.glossSectorDesc' },
  { termKey: 'help.glossModbus', descKey: 'help.glossModbusDesc' },
  { termKey: 'help.glossOcpp', descKey: 'help.glossOcppDesc' },
  { termKey: 'help.glossPwa', descKey: 'help.glossPwaDesc' },
  { termKey: 'help.glossVenusOs', descKey: 'help.glossVenusOsDesc' },
  { termKey: 'help.glossDbus', descKey: 'help.glossDbusDesc' },
  { termKey: 'help.glossNodeRed', descKey: 'help.glossNodeRedDesc' },
  { termKey: 'help.glossCerboGx', descKey: 'help.glossCerboGxDesc' },
  { termKey: 'help.glossV2x', descKey: 'help.glossV2xDesc' },
  { termKey: 'help.glossEebus', descKey: 'help.glossEebusDesc' },
  { termKey: 'help.glossHomeAssistant', descKey: 'help.glossHomeAssistantDesc' },
  { termKey: 'help.glossMatter', descKey: 'help.glossMatterDesc' },
  { termKey: 'help.glossEvcc', descKey: 'help.glossEvccDesc' },
  { termKey: 'help.glossOpenEms', descKey: 'help.glossOpenEmsDesc' },
  { termKey: 'help.glossOpenAdr', descKey: 'help.glossOpenAdrDesc' },
] as const;

/** Contrib protocol keys shared by HelpContribProtocolsSection and the help search index. */
export const HELP_CONTRIB_PROTOCOL_KEYS = [
  { titleKey: 'help.protocolHa', setupKey: 'help.contribSetupHa' },
  { titleKey: 'help.protocolEebus', setupKey: 'help.contribSetupEebus' },
  { titleKey: 'help.protocolEvcc', setupKey: 'help.contribSetupEvcc' },
  { titleKey: 'help.protocolOpenEms', setupKey: 'help.contribSetupOpenEms' },
  { titleKey: 'help.protocolOpenAdr', setupKey: 'help.contribSetupOpenAdr' },
  { titleKey: 'help.protocolMatter', setupKey: 'help.contribSetupMatter' },
  { titleKey: 'help.protocolZigbee', setupKey: 'help.contribSetupZigbee' },
  { titleKey: 'help.protocolShelly', setupKey: 'help.contribSetupShelly' },
] as const;

export type HelpSearchManifestEntry = {
  tab: HelpTab;
  titleKey: string;
  bodyKey: string;
  interpolateVersion?: boolean;
};

/** Static help search entries — glossary and contrib protocols are appended separately. */
export const HELP_SEARCH_MANIFEST: readonly HelpSearchManifestEntry[] = [
  { tab: 'getting-started', titleKey: 'help.quickStart', bodyKey: 'help.welcomeIntro' },
  { tab: 'getting-started', titleKey: 'help.step1Title', bodyKey: 'help.step1Desc' },
  {
    tab: 'faq',
    titleKey: 'help.faqWhatIs',
    bodyKey: 'help.faqWhatIsAnswer',
    interpolateVersion: true,
  },
  { tab: 'faq', titleKey: 'help.faqMockMode', bodyKey: 'help.faqMockModeAnswer' },
  { tab: 'faq', titleKey: 'help.faqReadOnly', bodyKey: 'help.faqReadOnlyAnswer' },
  { tab: 'faq', titleKey: 'help.faqApi', bodyKey: 'help.faqApiAnswer' },
  {
    tab: 'troubleshooting',
    titleKey: 'help.troubleConnection',
    bodyKey: 'help.troubleConn1',
  },
  {
    tab: 'troubleshooting',
    titleKey: 'help.troubleReadOnly',
    bodyKey: 'help.troubleReadOnly1',
  },
  {
    tab: 'features',
    titleKey: 'help.featureHardwareRegistry',
    bodyKey: 'help.featureHardwareRegistryDesc',
  },
  {
    tab: 'features',
    titleKey: 'help.featureMonitoring',
    bodyKey: 'help.featureMonitoringDesc',
  },
  {
    tab: 'integration',
    titleKey: 'help.integrationGuideTitle',
    bodyKey: 'help.integrationGuideIntro',
  },
  {
    tab: 'integration',
    titleKey: 'help.contribProtocolsTitle',
    bodyKey: 'help.contribProtocolsIntro',
  },
  {
    tab: 'about',
    titleKey: 'help.aboutTitle',
    bodyKey: 'help.aboutDesc',
    interpolateVersion: true,
  },
];
