import type { TFunction } from 'i18next';
import {
  BookOpen,
  Cable,
  FileText,
  Info,
  Keyboard,
  Lightbulb,
  MessageCircleQuestion,
  RefreshCw,
} from 'lucide-react';
import type { HelpTab } from './help-search-entries';

export const buildHelpTabs = (
  t: TFunction,
): { key: HelpTab; icon: React.ReactNode; label: string }[] => [
  { key: 'getting-started', icon: <BookOpen size={18} />, label: t('help.gettingStarted') },
  { key: 'integration', icon: <Cable size={18} />, label: t('help.integrationGuide') },
  { key: 'features', icon: <Lightbulb size={18} />, label: t('help.features') },
  { key: 'lexicon', icon: <FileText size={18} />, label: t('help.glossaryTitle') },
  { key: 'faq', icon: <MessageCircleQuestion size={18} />, label: t('help.faq') },
  { key: 'shortcuts', icon: <Keyboard size={18} />, label: t('help.shortcuts') },
  { key: 'troubleshooting', icon: <RefreshCw size={18} />, label: t('help.troubleshooting') },
  { key: 'about', icon: <Info size={18} />, label: t('help.about') },
];
