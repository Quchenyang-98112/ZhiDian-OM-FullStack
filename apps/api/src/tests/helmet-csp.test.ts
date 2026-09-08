/**
 * helmet-csp.test.ts — production Helmet CSP omits style-src unsafe-inline (AUD-02).
 */

import express from 'express';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'production';

const { configureHelmet } = await import('../middleware/security.js');

describe('configureHelmet production CSP (AUD-02)', () => {
  it('omits style-src unsafe-inline when build nonce is provided', async () => {
    const app = express();
    configureHelmet(app, false, 'test-build-nonce');
    app.get('/', (_req, res) => res.send('ok'));

    const res = await supertest(app).get('/');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("'nonce-test-build-nonce'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('fails closed (no style-src unsafe-inline) without a build nonce', async () => {
    // A missing build nonce must NOT degrade style-src to 'unsafe-inline' — that
    // would silently re-open the surface AUD-02 closed. It fails closed to 'self'.
    const app = express();
    configureHelmet(app, false);
    app.get('/', (_req, res) => res.send('ok'));

    const res = await supertest(app).get('/');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("style-src 'self'");
  });
});
