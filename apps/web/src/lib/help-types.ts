/** Help center tab identifiers used for search and deep-linking. */
export type HelpTab =
  | 'getting-started'
  | 'integration'
  | 'features'
  | 'lexicon'
  | 'faq'
  | 'shortcuts'
  | 'troubleshooting'
  | 'about';

/** Canonical tab order for Help navigation and search indexing. */
export const VALID_HELP_TABS: HelpTab[] = [
  'getting-started',
  'integration',
  'features',
  'lexicon',
  'faq',
  'shortcuts',
  'troubleshooting',
  'about',
];
