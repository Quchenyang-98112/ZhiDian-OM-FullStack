#!/usr/bin/env node
/**
 * PRF-03 / F-05a — fail CI when a workspace's coverage drops below the
 * committed baseline.
 *
 * Usage:
 *   node scripts/check-coverage-baseline.mjs [workspaceDir ...]
 *
 * Each workspaceDir is a path (relative to the repo root) that contains a
 * `coverage-baseline.json` and, after `test:coverage`, a
 * `coverage/coverage-summary.json`. Defaults to `apps/web` for backwards
 * compatibility. Run the matching `test:coverage` for every workspace first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOLERANCE = 0.05;
const METRICS = ['statements', 'branches', 'functions', 'lines'];

const workspaces = process.argv.slice(2);
if (workspaces.length === 0) {
  workspaces.push('apps/web');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pct(value) {
  return Number(value.toFixed(2));
}

/** @returns {string[]} failure messages for this workspace */
function checkWorkspace(dir) {
  const summaryPath = join(ROOT, dir, 'coverage/coverage-summary.json');
  const baselinePath = join(ROOT, dir, 'coverage-baseline.json');
  const failures = [];

  if (!existsSync(baselinePath)) {
    return [`${dir}: missing coverage-baseline.json`];
  }
  const baseline = readJson(baselinePath);

  let summary;
  try {
    summary = readJson(summaryPath);
  } catch {
    return [`${dir}: missing ${summaryPath}. Run its test:coverage first.`];
  }

  const total = summary.total;
  if (!total) {
    return [`${dir}: coverage-summary.json has no "total" section.`];
  }

  for (const metric of METRICS) {
    const raw = total[metric]?.pct;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
      // Fail loudly rather than treating a missing/renamed metric as 0% — a
      // silent 0 could slip past a future baseline floor of 0.
      failures.push(`${dir}: metric "${metric}" missing from coverage-summary.json`);
      continue;
    }
    const actual = pct(raw);
    const floor = baseline[metric];
    if (floor == null) {
      failures.push(`${dir}: baseline missing metric "${metric}"`);
      continue;
    }
    if (actual + TOLERANCE < floor) {
      failures.push(`${dir} ${metric}: ${actual}% < baseline ${floor}%`);
    } else {
      console.log(`[coverage-baseline] ${dir} ${metric}: ${actual}% (floor ${floor}%)`);
    }
  }
  return failures;
}

const allFailures = workspaces.flatMap(checkWorkspace);

if (allFailures.length > 0) {
  console.error('[coverage-baseline] Coverage regressed below committed baseline:');
  for (const line of allFailures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log('[coverage-baseline] All metrics meet or exceed the baseline.');
