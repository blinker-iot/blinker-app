import '@angular/compiler';
import { of, Subject } from 'rxjs';
import { API, isGatewayUrl } from '../../configs/api.config';
import { DeviceV2HistoryService } from './device-v2-history.service';
import { STATE_HISTORY_MAX_AGE_MS, STATE_HISTORY_MAX_RECORDS, STATE_HISTORY_RECORDED_TYPES } from '../device-v2/state-history';

const query = { from: 1000, to: 2000, limit: 50 }, id = 'device_a';
const detail = { logicalDeviceId: id, from: 1000, to: 2000, items: [], nextCursor: null,
  retention: { maxAgeMs: STATE_HISTORY_MAX_AGE_MS, maxRecords: STATE_HISTORY_MAX_RECORDS },
  timeBasis: 'serverAcceptedAt', source: 'broker-state', recordedTypes: [...STATE_HISTORY_RECORDED_TYPES] };
function harness(status = 200, body: any = { message: 1000, detail }, cache = 'private, no-store') {
  const http = { get: vi.fn(() => of({ status, body, headers: { get: () => cache } })) };
  return { http, client: new DeviceV2HistoryService(http as any) };
}
describe('Device V2 State history read API', () => {
  it('uses only the protected account GET with encoded range/cursor parameters, never the old storage API', async () => {
    const f = harness(), signal = new AbortController().signal;
    await expect(f.client.read(id, { ...query, key: 'power 键', before: 'YWJj' }, signal)).resolves.toEqual(detail);
    const [url, options] = f.http.get.mock.calls[0] as any;
    expect(url).toBe(`${API.DEVICE_V2.STATE_HISTORY(id)}?from=1000&to=2000&limit=50&key=power+%E9%94%AE&before=YWJj`);
    expect(options).toEqual({ observe: 'response' }); expect(isGatewayUrl(url)).toBe(true);
    expect(isGatewayUrl(API.DEVICE_V2.STATE_HISTORY(id) + '?from=1000&to=2000')).toBe(true);
    expect(isGatewayUrl(API.BASE_URL + '/api/v2/devices/device_a/state-history-invalid?from=1')).toBe(false);
  });
  it.each([
    [201, { message: 1000, detail }, 'no-store'], [200, { status: 200, data: detail }, 'no-store'],
    [200, { message: 999, detail }, 'no-store'], [200, { message: 1000, detail }, 'public'],
    [200, { message: 1000, detail: { ...detail, logicalDeviceId: 'other' } }, 'no-store'],
  ])('rejects wrong envelopes/status/target or cacheable responses', async (status, body, cache) => {
    await expect(harness(status as number, body, cache as string).client.read(id, query, new AbortController().signal)).rejects.toThrow();
  });
  it('validates before HTTP and cancels an in-flight read without retry or fallback', async () => {
    const f = harness(), aborted = new AbortController(); aborted.abort();
    await expect(f.client.read(id, query, aborted.signal)).rejects.toThrow(); expect(f.http.get).not.toHaveBeenCalled();
    await expect(f.client.read(id, { ...query, limit: 500 }, new AbortController().signal)).rejects.toThrow();
    expect(f.http.get).not.toHaveBeenCalled();
    const reply = new Subject<any>(), http = { get: vi.fn(() => reply) }, controller = new AbortController();
    const pending = new DeviceV2HistoryService(http as any).read(id, query, controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow(); expect(http.get).toHaveBeenCalledTimes(1);
    expect(reply.observed).toBe(false);
  });
});
