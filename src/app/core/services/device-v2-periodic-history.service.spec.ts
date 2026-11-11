import '@angular/compiler';
import { of, Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { DeviceV2PeriodicHistoryService } from './device-v2-periodic-history.service';

const id = 'device_a', hash = 'a'.repeat(64), query = { from: 1000, to: 2000, limit: 50 };
const detail = { logicalDeviceId: id, manifestFingerprint: hash, fields: [{ key: 'reading', type: 2 }], policy: null,
  runtime: { phase: 'disabled', failures: 0 }, limits: { intervalMs: 60000, maxFields: 4, maxAgeMs: 2592000000, maxRecords: 200000 },
  source: 'broker-telemetry', timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', canConfigure: true };
const page = { logicalDeviceId: id, from: 1000, to: 2000, items: [], nextCursor: null,
  retention: { maxAgeMs: 2592000000, maxRecords: 200000 }, source: 'broker-telemetry',
  timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', recordedTypes: [1, 2, 3, 4] };
function response(value: unknown, status = 200, cache = 'private, no-store') {
  return { status, body: { message: 1000, detail: value }, headers: { get: () => cache } };
}
function setup() {
  const http = { get: vi.fn((url: string) => of(response(url.includes('/periodic-history-policy') ? detail : page))), put: vi.fn() };
  return { http, service: new DeviceV2PeriodicHistoryService(http as any), signal: new AbortController().signal };
}
describe('Online history authenticated bounded HTTP', () => {
  it('uses two exact account routes with encoded queries and no legacy fallback', async () => {
    const f = setup(); await f.service.detail(id, f.signal);
    await f.service.read(id, { ...query, key: ' reading ', before: 'YWJj' }, f.signal);
    expect(f.http.get.mock.calls[0][0]).toBe(API.DEVICE_V2.PERIODIC_HISTORY_POLICY(id));
    expect(f.http.get.mock.calls[1][0]).toBe(`${API.DEVICE_V2.PERIODIC_HISTORY(id)}?from=1000&to=2000&limit=50&key=+reading+&before=YWJj`);
    expect(f.http.get.mock.calls.every(([url]) => isGatewayUrl(url))).toBe(true);
    for (const suffix of ['/periodic-history-invalid', '/periodic-history-policy/extra', '/periodic-history/extra']) {
      expect(isGatewayUrl(API.DEVICE_V2.DETAIL(id) + suffix)).toBe(false);
    }
  });
  it('sends one exact CAS PUT, validates confirmation against its body and never refreshes or retries automatically', async () => {
    const f = setup(), input = { expectedRevision: 0, enabled: true, manifestFingerprint: hash, keys: ['reading'] };
    const confirmed = { ...detail, policy: { revision: 1, enabled: true, manifestFingerprint: hash,
      keys: ['reading'], intervalMs: 60000, updatedAt: 1000 }, runtime: { phase: 'waiting', failures: 0 } };
    f.http.put.mockReturnValueOnce(of(response(confirmed)));
    await expect(f.service.save(id, input, f.signal)).resolves.toEqual(confirmed);
    expect(f.http.put).toHaveBeenCalledExactlyOnceWith(API.DEVICE_V2.PERIODIC_HISTORY_POLICY(id), input, { observe: 'response' });
    expect(f.http.get).not.toHaveBeenCalled();
    f.http.put.mockReturnValueOnce(of(response({ ...confirmed, policy: { ...confirmed.policy, revision: 3 } })));
    await expect(f.service.save(id, input, f.signal)).rejects.toThrow(); expect(f.http.put).toHaveBeenCalledTimes(2);
  });
  it.each([[201, 'no-store'], [200, 'public']])('rejects invalid response status/cache %s/%s', async (status, cache) => {
    const f = setup(); f.http.get.mockReturnValueOnce(of(response(detail, status as number, cache as string)));
    await expect(f.service.detail(id, f.signal)).rejects.toThrow();
  });
  it('aborts subscriptions without retry, validates request bodies before HTTP and sends no broad arbitrary path', async () => {
    const f = setup(), controller = new AbortController(), subject = new Subject<any>();
    f.http.get.mockReturnValueOnce(subject as any);
    const pending = f.service.detail(id, controller.signal); controller.abort();
    await expect(pending).rejects.toThrow(); expect(subject.observed).toBe(false); expect(f.http.get).toHaveBeenCalledTimes(1);
    await expect(f.service.save(id, { expectedRevision: 0, enabled: true, manifestFingerprint: hash, keys: [] }, f.signal)).rejects.toThrow();
    expect(f.http.put).not.toHaveBeenCalled();
  });
});
