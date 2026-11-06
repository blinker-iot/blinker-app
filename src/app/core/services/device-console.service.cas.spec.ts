import { of, throwError } from 'rxjs';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';
import { DeviceConsole, DeviceConsoleService } from './device-console.service';

describe('Console aggregate revision write boundary', () => {
  const id = 'console-cas-device';
  const record = (revision = 103): DeviceConsole => ({ logicalDeviceId: id, name: '测试设备', deviceType: 'WiFi',
    revision, layout: null, uiConfig: { panelMode: 'normal' }, defaultMode: 'normal', availableModes: ['normal'],
    capabilities: { canRead: true, canCommand: true, commandEndpointKeys: null, canEditConsole: true, canManageSharing: true } });

  it('sends the explicitly read aggregate revision once and takes the actual returned version', async () => {
    const http = { put: vi.fn(() => of({ data: record() })), get: vi.fn() };
    const service = new DeviceConsoleService(http as any, 'https://gateway.example');
    const result = await service.save(id, { uiConfig: { panelMode: 'normal' } }, 101);
    expect(http.put).toHaveBeenCalledOnce();
    expect(http.put.mock.calls[0].slice(0, 2)).toEqual(['https://gateway.example/api/v2/devices/' + id + '/console',
      { uiConfig: { panelMode: 'normal' }, expectedRevision: 101 }]);
    expect((http.put.mock.calls[0] as any)[2].context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(result.revision).toBe(103); expect(http.get).not.toHaveBeenCalled();
  });

  it.each([undefined, null, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])('rejects invalid or missing revision %s before transport', async value => {
    const http = { put: vi.fn(), get: vi.fn() };
    const service = new DeviceConsoleService(http as any, 'https://gateway.example');
    await expect(service.save(id, { uiConfig: { panelMode: 'normal' } }, value as number)).rejects.toThrow('DEVICE_CONSOLE_REVISION_REQUIRED');
    expect(http.put).not.toHaveBeenCalled(); expect(http.get).not.toHaveBeenCalled();
  });

  it('permits an explicitly read initial zero revision', async () => {
    const http = { put: vi.fn(() => of({ data: record(2) })) };
    const service = new DeviceConsoleService(http as any, 'https://gateway.example');
    await expect(service.save(id, { uiConfig: { panelMode: 'normal' } }, 0)).resolves.toHaveProperty('revision', 2);
    expect((http.put.mock.calls[0] as any)[1].expectedRevision).toBe(0);
  });

  it('never refreshes or replays a rejected stale write', async () => {
    const conflict = { code: 'DEVICE_CONSOLE_CONFLICT' };
    const http = { put: vi.fn(() => throwError(() => conflict)), get: vi.fn() };
    const service = new DeviceConsoleService(http as any, 'https://gateway.example');
    await expect(service.save(id, { uiConfig: { panelMode: 'normal' } }, 101)).rejects.toBe(conflict);
    expect(http.put).toHaveBeenCalledOnce(); expect(http.get).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('does not accept an invalid returned aggregate revision %s', async revision => {
    const service = new DeviceConsoleService({ get: () => of({ data: record(revision) }) } as any, 'https://gateway.example');
    await expect(service.get(id)).rejects.toThrow('控制台配置无效');
  });
});
