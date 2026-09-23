import { of, Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { LegacyImportService } from './legacy-import.service';

const source = { sourceCollection: 'devices' as const, sourceId: 'a'.repeat(24), snapshot: { deviceName: 'old-id', displayName: 'Lamp' } };

function harness(get = vi.fn()) {
  const data = { auth: { accessToken: 'test' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  return { data, get, service: new LegacyImportService({ get } as any, data as any) };
}

describe('legacy source inventory', () => {
  it('loads all source pages, deduplicates records and marks the routes as authenticated', async () => {
    const get = vi.fn()
      .mockReturnValueOnce(of({ status: 200, data: { items: [source], nextCursor: 'next' } }))
      .mockReturnValueOnce(of({ status: 200, data: { items: [source], nextCursor: null } }));
    const { service } = harness(get);
    await expect(service.load()).resolves.toEqual([source]);
    expect(get.mock.calls[1][1]).toEqual({ params: { cursor: 'next' } });
    expect(isGatewayUrl(API.ACCOUNT.LEGACY_IMPORTS + '/preview')).toBe(true);
  });

  it('keeps safely saved blocked records whose device name was omitted', async () => {
    const blocked = { ...source, snapshot: { displayName: 'Needs review', issues: [{ path: 'device.deviceName', code: 'UNSAFE_OR_INVALID_FIELD' }] } };
    const { service } = harness(vi.fn(() => of({ status: 200, data: { items: [blocked], nextCursor: null } })));
    await expect(service.load()).resolves.toEqual([blocked]);
  });

  it('does not publish another account response after a session change', async () => {
    const response = new Subject<unknown>();
    const { data, service } = harness(vi.fn(() => response));
    const pending = service.load();
    data.sessionEpoch += 1;
    data.authDataChanged.next();
    response.next({ status: 200, data: { items: [source], nextCursor: null } });
    await expect(pending).rejects.toThrow('登录账号已改变');
    expect(service.records.value).toEqual([]);
  });

  it('rejects repeated cursors without publishing a partially read list', async () => {
    const { service } = harness(vi.fn(() => of({ status: 200, data: { items: [source], nextCursor: 'repeat' } })));
    await expect(service.load()).rejects.toThrow('分页未完成');
    expect(service.records.value).toEqual([]);
  });
});
