import { afterEach, describe, expect, it } from 'vitest';
import { validateProductionAuthConfig } from '../config/auth-config.js';

const BASE_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  API_KEYS: 'monitor-key,operator-key',
  API_KEY_SCOPES: 'monitor-key:read,operator-key:readwrite',
};

describe('validateProductionAuthConfig', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.API_KEYS;
    delete process.env.API_KEY_SCOPES;
  });

  it('skips validation in development', () => {
    expect(() =>
      validateProductionAuthConfig({ NODE_ENV: 'development', API_KEYS: '' }),
    ).not.toThrow();
  });

  it('passes when every API key has a scope binding', () => {
    expect(() => validateProductionAuthConfig({ ...BASE_ENV })).not.toThrow();
  });

  it('throws when API_KEYS is empty in production', () => {
    expect(() =>
      validateProductionAuthConfig({ NODE_ENV: 'production', API_KEY_SCOPES: 'k:read' }),
    ).toThrow(/API_KEYS/);
  });

  it('enforces production auth when NODE_ENV is unset (SEC-11)', () => {
    expect(() =>
      validateProductionAuthConfig({
        API_KEYS: 'only-key',
        API_KEY_SCOPES: 'only-key:read',
      }),
    ).not.toThrow();
    expect(() => validateProductionAuthConfig({ API_KEYS: 'only-key' })).toThrow(/API_KEY_SCOPES/);
  });

  it('throws when API_KEY_SCOPES is unset in production', () => {
    expect(() =>
      validateProductionAuthConfig({
        NODE_ENV: 'production',
        API_KEYS: 'only-key',
      }),
    ).toThrow(/API_KEY_SCOPES/);
  });

  it('throws when a production API key has no scope binding', () => {
    expect(() =>
      validateProductionAuthConfig({
        NODE_ENV: 'production',
        API_KEYS: 'monitor-key,operator-key',
        API_KEY_SCOPES: 'monitor-key:read',
      }),
    ).toThrow(/operator-key/);
  });
});
