import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExampleContribAdapter } from '../core/adapters/contrib/example-contrib';

describe('ExampleContribAdapter — smoke', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects, polls mock data, and disconnects cleanly', async () => {
    vi.useFakeTimers();
    const adapter = new ExampleContribAdapter({ pollIntervalMs: 5000 });

    await adapter.connect();
    vi.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(adapter.getSnapshot().pv).toBeDefined();

    await adapter.disconnect();
    adapter.destroy();
  });

  it('exposes register() factory in the adapter registry', async () => {
    const { getRegisteredAdapter, unregisterAdapter } = await import(
      '../core/adapters/adapter-registry'
    );
    const { register } = await import('../core/adapters/contrib/example-contrib');

    register();
    const entry = getRegisteredAdapter('example-contrib');
    expect(entry?.source).toBe('contrib');
    unregisterAdapter('example-contrib');
  });
});
