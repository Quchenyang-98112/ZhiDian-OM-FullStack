import type { TFunction } from 'i18next';
import packageJson from '../../package.json';
import {
  HELP_CONTRIB_PROTOCOL_KEYS,
  HELP_GLOSSARY_ENTRIES,
  HELP_SEARCH_MANIFEST,
} from './help-content-manifest';

export type { HelpTab } from './help-types';
export { VALID_HELP_TABS } from './help-types';

const mapManifestEntries = (t: TFunction, appVersion: string) =>
  HELP_SEARCH_MANIFEST.map((entry) => ({
    tab: entry.tab,
    title: t(entry.titleKey),
    body: entry.interpolateVersion ? t(entry.bodyKey, { version: appVersion }) : t(entry.bodyKey),
  }));

const mapContribEntries = (t: TFunction) =>
  HELP_CONTRIB_PROTOCOL_KEYS.map((entry) => ({
    tab: 'integration' as const,
    title: t(entry.titleKey),
    body: t(entry.setupKey),
  }));

const mapGlossaryEntries = (t: TFunction) =>
  HELP_GLOSSARY_ENTRIES.map((entry) => ({
    tab: 'lexicon' as const,
    title: t(entry.termKey),
    body: t(entry.descKey),
  }));

export const buildHelpSearchEntries = (t: TFunction) => {
  const appVersion = packageJson.version;
  return [...mapManifestEntries(t, appVersion), ...mapContribEntries(t), ...mapGlossaryEntries(t)];
};

export const filterHelpSearchResults = (
  entries: ReturnType<typeof buildHelpSearchEntries>,
  normalizedQuery: string,
) => {
  if (normalizedQuery.length < 2) return [];
  return entries
    .filter(
      (e) =>
        e.title.toLowerCase().includes(normalizedQuery) ||
        e.body.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 8);
};
