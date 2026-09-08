/**
 * MED-08: i18n key parity test
 *
 * Recursively walks all keys in the English locale and verifies that the same
 * keys exist in the German locale (the fallback language).  This prevents
 * missing-translation regressions from slipping into production.
 *
 * Only key presence is checked — value quality is out of scope for automation.
 */

import { describe, expect, it } from 'vitest';
import { de } from '../locales/de';
import { en } from '../locales/en';

// ─── Helpers ─────────────────────────────────────────────────────────

type NestedObject = Record<string, unknown>;

/**
 * Returns a flat dot-notation list of all leaf key paths in an object.
 * e.g. { a: { b: 'x' } } → ['a.b']
 */
function collectKeys(obj: NestedObject, prefix = ''): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as NestedObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Check whether a dot-path exists in a nested object.
 */
function hasPath(obj: NestedObject, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object' || !(part in (current as NestedObject))) {
      return false;
    }
    current = (current as NestedObject)[part];
  }
  return true;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('i18n locale parity (EN → DE)', () => {
  const enKeys = collectKeys(en as unknown as NestedObject);
  const deObj = de as unknown as NestedObject;

  it('German locale should have all keys that exist in English', () => {
    const missingKeys = enKeys.filter((key) => !hasPath(deObj, key));

    if (missingKeys.length > 0) {
      // Pretty-print the first 20 missing keys for quick triage
      const preview = missingKeys.slice(0, 20).join('\n  ');
      throw new Error(
        `Found ${missingKeys.length} key(s) missing from de.ts:\n  ${preview}${missingKeys.length > 20 ? `\n  … and ${missingKeys.length - 20} more` : ''}`,
      );
    }

    expect(missingKeys).toHaveLength(0);
  });

  it('English locale should have all keys that exist in German (reverse parity)', () => {
    const deKeys = collectKeys(deObj);
    const enObj = en as unknown as NestedObject;
    const missingKeys = deKeys.filter((key) => !hasPath(enObj, key));

    if (missingKeys.length > 0) {
      const preview = missingKeys.slice(0, 20).join('\n  ');
      throw new Error(
        `Found ${missingKeys.length} key(s) in de.ts that are missing from en.ts:\n  ${preview}${missingKeys.length > 20 ? `\n  … and ${missingKeys.length - 20} more` : ''}`,
      );
    }

    expect(missingKeys).toHaveLength(0);
  });

  it('Both locales should have a non-zero number of keys', () => {
    expect(enKeys.length).toBeGreaterThan(0);
    expect(collectKeys(deObj).length).toBeGreaterThan(0);
  });
});
