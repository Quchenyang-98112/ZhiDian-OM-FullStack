import {
  BookOpen,
  Cable,
  FileText,
  Info,
  Lightbulb,
  MessageCircleQuestion,
  RefreshCw,
} from 'lucide-react';
import type { CommandDefinition } from '../types';
import { navigateAndClose } from './provider-utils';

function helpTab(
  id: string,
  labelKey: string,
  tab: string,
  icon: NonNullable<CommandDefinition['icon']>,
  keywords: string[],
): CommandDefinition {
  return {
    id,
    labelKey,
    icon,
    category: 'navigation',
    risk: 'safe',
    keywords,
    source: 'core',
    execute: (ctx) => navigateAndClose(ctx, `/help?tab=${tab}`),
  };
}

/** Contextual Help tab shortcuts for the command palette (Phase 5 / N3). */
export function createHelpCommands(): CommandDefinition[] {
  return [
    helpTab(
      'nav-help-getting-started',
      'command.navHelpGettingStarted',
      'getting-started',
      BookOpen,
      ['help', 'onboarding', 'start', 'einrichtung', 'anleitung'],
    ),
    helpTab('nav-help-integration', 'command.navHelpIntegration', 'integration', Cable, [
      'help',
      'integration',
      'adapter',
      'protocol',
      'einbindung',
    ]),
    helpTab('nav-help-features', 'command.navHelpFeatures', 'features', Lightbulb, [
      'help',
      'features',
      'funktionen',
    ]),
    helpTab('nav-help-lexicon', 'command.navHelpLexicon', 'lexicon', FileText, [
      'help',
      'glossary',
      'lexicon',
      'glossar',
      'begriffe',
    ]),
    helpTab('nav-help-faq', 'command.navHelpFaq', 'faq', MessageCircleQuestion, [
      'help',
      'faq',
      'questions',
      'fragen',
    ]),
    helpTab(
      'nav-help-troubleshooting',
      'command.navHelpTroubleshooting',
      'troubleshooting',
      RefreshCw,
      ['help', 'troubleshooting', 'error', 'problem', 'fehler', 'hilfe'],
    ),
    helpTab('nav-help-about', 'command.navHelpAbout', 'about', Info, [
      'help',
      'about',
      'version',
      'über',
    ]),
  ];
}
