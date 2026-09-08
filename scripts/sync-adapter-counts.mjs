#!/usr/bin/env node
/**
 * F-04 drift guard — keep the README adapter counts in sync with the code.
 *
 * Ground truth:
 *   core    = registerAdapter(...) call sites inside registerBuiltinAdapters()
 *             (JSDoc `@example registerAdapter(...)` comments elsewhere in the
 *             file are excluded because we only scan the function body).
 *   contrib = contrib/*.ts modules, excluding the `example-contrib` template
 *             and any *.test.ts / *.d.ts files.
 *
 * The computed phrase is injected between the ADAPTERS-EN / ADAPTERS-DE markers
 * in README.md. CI runs this script and then `git diff --exit-code README.md`,
 * so adding an adapter without re-running fails the build (stale marker).
 *
 * Usage: `node scripts/sync-adapter-counts.mjs` (rewrites README.md in place).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REGISTRY = join(ROOT, 'apps/web/src/core/adapters/adapter-registry.ts');
const CONTRIB_DIR = join(ROOT, 'apps/web/src/core/adapters/contrib');
const README = join(ROOT, 'README.md');
const EXCLUDE_CONTRIB = new Set(['example-contrib']);

/** Count `registerAdapter(` calls inside the registerBuiltinAdapters() body. */
function countCoreAdapters() {
  const src = readFileSync(REGISTRY, 'utf8');
  const fnStart = src.indexOf('export function registerBuiltinAdapters()');
  if (fnStart === -1) {
    throw new Error('registerBuiltinAdapters() not found in adapter-registry.ts');
  }
  const braceOpen = src.indexOf('{', fnStart);
  // Biome formats top-level functions with their closing brace in column 0, so
  // the function body ends at the first line-leading `}`. Slicing on that is
  // robust to inner (indented) braces inside strings/comments/config objects —
  // unlike naive brace-depth counting, which a `{` in a string could unbalance.
  const closeIdx = src.indexOf('\n}', braceOpen);
  if (closeIdx === -1) throw new Error('Could not find registerBuiltinAdapters() closing brace');
  const body = src.slice(braceOpen, closeIdx);
  return (body.match(/registerAdapter\(/g) ?? []).length;
}

/** Count shipped contrib adapter modules (excluding the template + test/d.ts). */
function countContribAdapters() {
  return readdirSync(CONTRIB_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.ts'))
    .map((d) => d.name)
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .filter((id) => !EXCLUDE_CONTRIB.has(id)).length;
}

function replaceMarker(text, tag, replacement) {
  const re = new RegExp(`(<!-- ${tag}:START -->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  if (!re.test(text)) {
    throw new Error(`Marker ${tag} not found in README.md`);
  }
  return text.replace(re, `$1${replacement}$2`);
}

const core = countCoreAdapters();
const contrib = countContribAdapters();
const total = core + contrib;

let readme = readFileSync(README, 'utf8');
readme = replaceMarker(readme, 'ADAPTERS-EN', `**${total} protocol adapters** (${core} core + ${contrib} contrib)`);
readme = replaceMarker(readme, 'ADAPTERS-DE', `**${total} Protokolladapter** (${core} Core + ${contrib} Contrib)`);
writeFileSync(README, readme);

console.log(`[sync-adapter-counts] core=${core} contrib=${contrib} total=${total}`);
