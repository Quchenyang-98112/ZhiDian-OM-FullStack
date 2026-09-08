import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the "empty field at top / Sankey pushed down on every
 * command" bug: the app's strict CSP (AUD-02) meta tag sets
 * `style-src 'self' 'nonce-…'` with no 'unsafe-inline', which blocks sonner's
 * runtime-injected <style> tag. Without the bundled copy of sonner's CSS the
 * toaster loses `position: fixed` and renders inline at the top of the tree
 * (it's placed before <AppShell>), shifting the whole page down until the toast
 * auto-dismisses. Importing sonner/dist/styles.css serves the positioning rules
 * from 'self', which the CSP allows.
 */
describe('sonner CSP-safe styling', () => {
  it("main.tsx bundles sonner's stylesheet from 'self'", () => {
    // vitest runs with cwd = apps/web.
    const mainSrc = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(mainSrc).toContain("import 'sonner/dist/styles.css'");
  });
});
