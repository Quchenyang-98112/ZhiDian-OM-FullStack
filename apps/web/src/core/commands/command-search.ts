import type { CommandDefinition } from './types';

const SCORE_EMPTY_BASE = 10;
const SCORE_EMPTY_FAVORITE = 50;
const SCORE_EMPTY_RECENT = 25;
const SCORE_EMPTY_CONTEXTUAL = 30;

const SCORE_EXACT = 120;
const SCORE_PREFIX = 100;
const SCORE_INCLUDES = 60;
const SCORE_KEYWORD_EXACT = 50;
const SCORE_KEYWORD_PREFIX = 40;
const SCORE_KEYWORD_INCLUDES = 25;
const SCORE_ID_TAIL = 15;

const SCORE_BOOST_FAVORITE = 20;
const SCORE_BOOST_RECENT = 15;
const SCORE_BOOST_CONTEXTUAL = 25;

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[\s\-_/]+/)
    .filter(Boolean);
}

/**
 * Lightweight fuzzy scorer — no external deps, target <5ms @500 commands.
 */
export function scoreCommand(
  cmd: CommandDefinition,
  label: string,
  query: string,
  boosts: { recent: boolean; favorite: boolean; contextual: boolean },
): number {
  const q = normalize(query.trim());
  if (!q) {
    let base = SCORE_EMPTY_BASE;
    if (boosts.favorite) base += SCORE_EMPTY_FAVORITE;
    if (boosts.recent) base += SCORE_EMPTY_RECENT;
    if (boosts.contextual) base += SCORE_EMPTY_CONTEXTUAL;
    return base;
  }

  const labelNorm = normalize(label);
  let score = 0;

  if (labelNorm === q) score += SCORE_EXACT;
  else if (labelNorm.startsWith(q)) score += SCORE_PREFIX;
  else if (labelNorm.includes(q)) score += SCORE_INCLUDES;

  const keywords = cmd.keywords ?? [];
  for (const kw of keywords) {
    const kn = normalize(kw);
    if (kn === q) score += SCORE_KEYWORD_EXACT;
    else if (kn.startsWith(q)) score += SCORE_KEYWORD_PREFIX;
    else if (kn.includes(q)) score += SCORE_KEYWORD_INCLUDES;
  }

  const idTail = cmd.id.split('.').pop() ?? cmd.id;
  if (normalize(idTail).includes(q)) score += SCORE_ID_TAIL;

  // Do not surface unrelated commands via boosts when the query has no text match.
  if (q && score === 0) return 0;

  if (boosts.favorite) score += SCORE_BOOST_FAVORITE;
  if (boosts.recent) score += SCORE_BOOST_RECENT;
  if (boosts.contextual) score += SCORE_BOOST_CONTEXTUAL;

  return score;
}

export function buildSearchTokens(label: string, keywords: string[] = []): string[] {
  return [...tokenize(label), ...keywords.flatMap((k) => tokenize(k))];
}
