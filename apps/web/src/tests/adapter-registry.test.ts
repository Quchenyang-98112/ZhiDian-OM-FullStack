import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRegisteredAdapter,
  getRegisteredAdapter,
  isAdapterRegistered,
  listRegisteredAdapters,
  registerAdapter,
  registerBuiltinAdapters,
  unregisterAdapter,
} from '../core/adapters/adapter-registry';

// Simple mock adapter factory
function createMockFactory() {
  return () =>
    ({
      id: 'mock',
      name: 'Mock',
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => false,
      getLatestData: () => null,
      subscribe: () => () => {},
    }) as never;
}

describe('Adapter Registry', () => {
  // Use unique IDs per test to avoid cross-test pollution in the global registry
  let testId = 0;
  function uniqueId(prefix = 'test-adapter') {
    return `${prefix}-${++testId}-${Math.random().toString(36).slice(2, 8)}`;
  }

  beforeEach(() => {
    // Increment base to ensure uniqueness across tests
    testId += 100;
  });

  it('should register an adapter', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory(), {
      displayName: 'Test',
      description: 'A test adapter',
      source: 'contrib',
    });
    expect(isAdapterRegistered(id)).toBe(true);
  });

  it('should reject invalid adapter IDs', () => {
    expect(() => registerAdapter('INVALID_ID', createMockFactory())).toThrow(/Invalid adapter id/);
    expect(() => registerAdapter('123-bad', createMockFactory())).toThrow(/Invalid adapter id/);
    expect(() => registerAdapter('has space', createMockFactory())).toThrow(/Invalid adapter id/);
  });

  it('should skip duplicate registration silently in dev', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory());
    // Second registration should not throw
    expect(() => registerAdapter(id, createMockFactory())).not.toThrow();
  });

  it('should get a registered adapter by id', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory(), {
      displayName: 'Get Test',
      source: 'contrib',
    });
    const adapter = getRegisteredAdapter(id);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe(id);
    expect(adapter?.displayName).toBe('Get Test');
  });

  it('should return undefined for unregistered adapter', () => {
    expect(getRegisteredAdapter('nonexistent-adapter-xyz')).toBeUndefined();
  });

  it('should list all registered adapters', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory());
    const list = listRegisteredAdapters();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((a) => a.id === id)).toBe(true);
  });

  it('should check if adapter is registered', () => {
    const id = uniqueId();
    expect(isAdapterRegistered(id)).toBe(false);
    registerAdapter(id, createMockFactory());
    expect(isAdapterRegistered(id)).toBe(true);
  });

  it('should create adapter instance from registry', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory());
    const instance = createRegisteredAdapter(id);
    expect(instance).toBeDefined();
  });

  it('should return undefined when creating unregistered adapter', () => {
    expect(createRegisteredAdapter('nonexistent-xyz-abc')).toBeUndefined();
  });

  it('should unregister contrib adapters', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory(), { source: 'contrib' });
    expect(isAdapterRegistered(id)).toBe(true);
    const result = unregisterAdapter(id);
    expect(result).toBe(true);
    expect(isAdapterRegistered(id)).toBe(false);
  });

  it('should not unregister builtin adapters', () => {
    const id = uniqueId('builtin');
    registerAdapter(id, createMockFactory(), { source: 'builtin' });
    const result = unregisterAdapter(id);
    expect(result).toBe(false);
    expect(isAdapterRegistered(id)).toBe(true);
  });

  it('should return false when unregistering nonexistent adapter', () => {
    expect(unregisterAdapter('does-not-exist-xyz')).toBe(false);
  });

  it('should set default source to contrib', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory());
    const adapter = getRegisteredAdapter(id);
    expect(adapter?.source).toBe('contrib');
  });

  it('should use id as default displayName', () => {
    const id = uniqueId();
    registerAdapter(id, createMockFactory());
    const adapter = getRegisteredAdapter(id);
    expect(adapter?.displayName).toBe(id);
  });

  it('registers all 7 built-in core adapters', () => {
    registerBuiltinAdapters();
    expect(isAdapterRegistered('victron-mqtt')).toBe(true);
    expect(isAdapterRegistered('modbus-sunspec')).toBe(true);
    expect(isAdapterRegistered('knx')).toBe(true);
    expect(isAdapterRegistered('ocpp-21')).toBe(true);
    expect(isAdapterRegistered('eebus')).toBe(true);
    expect(isAdapterRegistered('evcc')).toBe(true);
    expect(isAdapterRegistered('openems')).toBe(true);
  });
});
