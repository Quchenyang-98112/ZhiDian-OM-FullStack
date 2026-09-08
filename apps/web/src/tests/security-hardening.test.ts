import { describe, expect, it, vi } from 'vitest';
import {
  buildAllowedPollUrl,
  isAllowedUrl,
  isPrivateIPv4,
  sanitizePollHeaders,
} from '../core/adapter-worker';
import { OpenEMSAdapter } from '../core/adapters/OpenEMSAdapter';
import { PluginManager } from '../core/plugin-system';

function seedOpenEMSComponent(adapter: OpenEMSAdapter, componentId: string, factoryId: string) {
  const edgeComponents = new Map([
    [
      componentId,
      {
        id: componentId,
        factoryId,
        alias: componentId,
        properties: {},
        channels: {},
      },
    ],
  ]);

  (
    adapter as unknown as {
      edgeComponents: typeof edgeComponents;
    }
  ).edgeComponents = edgeComponents;
}

describe('Security hardening', () => {
  it('rejects unsafe OpenEMS component ids before RPC', async () => {
    const adapter = new OpenEMSAdapter();
    const rpcCall = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'rpc-1' });

    (adapter as unknown as { rpcCall: typeof rpcCall }).rpcCall = rpcCall;

    const ok = await adapter.updateControllerConfig('../ctrl', [{ name: 'mode', value: 1 }]);

    expect(ok).toBe(false);
    expect(rpcCall).not.toHaveBeenCalled();
  });

  it('sanitizes OpenEMS controller properties before RPC', async () => {
    const adapter = new OpenEMSAdapter();
    const rpcCall = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'rpc-1' });

    (adapter as unknown as { rpcCall: typeof rpcCall }).rpcCall = rpcCall;
    seedOpenEMSComponent(adapter, 'ctrlEssFixActivePower0', 'Controller.Ess.FixActivePower');

    const ok = await adapter.updateControllerConfig('ctrlEssFixActivePower0', [
      { name: 'mode', value: { nested: true } },
      { name: 'power', value: 4200 },
      { name: 'bad key with spaces', value: 'drop-me' },
    ]);

    expect(ok).toBe(true);
    expect(rpcCall).toHaveBeenCalledWith('updateComponentConfig', {
      componentId: 'ctrlEssFixActivePower0',
      properties: [
        { name: 'mode', value: null },
        { name: 'power', value: 4200 },
      ],
    });
  });

  it('rejects OpenEMS properties outside the writable allowlist before RPC', async () => {
    const adapter = new OpenEMSAdapter();
    const rpcCall = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'rpc-1' });

    (adapter as unknown as { rpcCall: typeof rpcCall }).rpcCall = rpcCall;
    seedOpenEMSComponent(adapter, 'ctrlEssFixActivePower0', 'Controller.Ess.FixActivePower');

    const ok = await adapter.updateControllerConfig('ctrlEssFixActivePower0', [
      { name: 'peakShavingPower', value: 4200 },
    ]);

    expect(ok).toBe(false);
    expect(rpcCall).not.toHaveBeenCalled();
  });

  it('requires discovered factory metadata before allowing OpenEMS writes', async () => {
    const adapter = new OpenEMSAdapter();
    const rpcCall = vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'rpc-1' });

    (adapter as unknown as { rpcCall: typeof rpcCall }).rpcCall = rpcCall;

    const ok = await adapter.updateControllerConfig('ctrlEssFixActivePower0', [
      { name: 'power', value: 4200 },
    ]);

    expect(ok).toBe(false);
    expect(rpcCall).not.toHaveBeenCalled();
  });

  it('validates private IPv4 ranges strictly', () => {
    expect(isPrivateIPv4('192.168.1.10')).toBe(true);
    expect(isPrivateIPv4('172.16.0.5')).toBe(true);
    expect(isPrivateIPv4('172.31.255.254')).toBe(true);
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    expect(isPrivateIPv4('192.168.999.1')).toBe(false);
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
  });

  it('allows only safe worker poll URLs', () => {
    expect(isAllowedUrl(new URL('https://192.168.1.10/api'))).toBe(true);
    expect(isAllowedUrl(new URL('http://localhost:3000/status'))).toBe(true);
    expect(isAllowedUrl(new URL('http://[::1]:8080/health'))).toBe(true);

    expect(isAllowedUrl(new URL('http://user:pass@192.168.1.10/api'))).toBe(false);
    expect(isAllowedUrl(new URL('https://8.8.8.8/api'))).toBe(false);
    expect(isAllowedUrl(new URL('ftp://192.168.1.10/file'))).toBe(false);
  });

  it('builds safe poll URLs only from structured local-network targets', () => {
    const safeUrl = buildAllowedPollUrl({
      protocol: 'http',
      host: '192.168.1.10',
      port: 8080,
      path: '/api/modbus/sunspec',
      query: { model: '103' },
    });

    expect(safeUrl?.href).toBe('http://192.168.1.10:8080/api/modbus/sunspec?model=103');
    expect(
      buildAllowedPollUrl({
        protocol: 'https',
        host: '8.8.8.8',
        path: '/api',
      }),
    ).toBeNull();
    expect(
      buildAllowedPollUrl({
        protocol: 'http',
        host: '192.168.1.10',
        path: '/../admin',
      }),
    ).toBeNull();
  });

  it('drops unsafe poll headers before fetch', () => {
    expect(
      sanitizePollHeaders({
        Authorization: 'Bearer token',
        Host: 'evil.example',
        'X-Adapter': 'modbus',
        Cookie: 'secret=1',
      }),
    ).toEqual({ Authorization: 'Bearer token', 'X-Adapter': 'modbus' });
  });

  it('sanitizes plugin-scoped logs to single safe line', async () => {
    const manager = new PluginManager();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const plugin = {
      descriptor: {
        id: 'bad%s\nplugin',
        name: 'Bad Plugin',
        version: '1.0.0',
      },
      activate: (ctx: {
        log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
      }) => {
        ctx.log('info', 'line1\nline2\t%s');
      },
    };

    expect(manager.install(plugin)).toEqual({ success: true });
    await manager.start(plugin.descriptor.id);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.length).toBe(1);
    const line = String(infoSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('[Plugin:bad_s_plugin]');
    expect(line).not.toContain('\n');
    expect(line).not.toContain('\t');

    infoSpy.mockRestore();
  });

  it('sanitizes event names in plugin event-bus error logs', () => {
    const manager = new PluginManager();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = manager.getEventBus();

    bus.on('event\n%s', () => {
      throw new Error('boom');
    });

    bus.emit('event\n%s', {});

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('event__s');
    expect(line).not.toContain('\n');

    errorSpy.mockRestore();
  });
});
