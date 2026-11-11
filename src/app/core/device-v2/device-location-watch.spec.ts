import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceLocationWatch, DeviceLocationWatchPort } from './device-location-watch';
import { DeviceLocationTelemetryLatest, DeviceLocationTelemetryLease,
  DeviceLocationTelemetryLeaseControl } from './device-location-telemetry';

const id = 'device_location';
const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
const detail = (changes: Partial<DeviceLocationTelemetryLatest> = {}): DeviceLocationTelemetryLatest => ({
  logicalDeviceId: id, capability: { codec: 'device-gnss-v1', endpointId: 3, manifestFingerprint: 'a'.repeat(64) },
  source: 'device-gnss', coordinateSystem: 'WGS84', sample: { latitudeE7: 310000000, longitudeE7: 1200000000,
    horizontalAccuracyCm: null, capturedAtUtcMillis: null, timeQuality: 0, ageMillisAtReceipt: 0, receivedAt: 1 },
  ageMillis: 1000, fresh: true, ...changes,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function accepted(device: string, command: DeviceLocationTelemetryLeaseControl): DeviceLocationTelemetryLease {
  return { logicalDeviceId: device, leaseId: command.leaseId, phase: command.operation === 'close' ? 'closed' : 'active',
    intervalMs: 5000, expiresAt: 30000, leaseMs: command.operation === 'close' ? 0 : 30000 };
}
function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  let scope = true, nonce = 0;
  const current = () => scope;
  const changed = vi.fn();
  const read = vi.fn<DeviceLocationWatchPort['read']>(async () => detail());
  const control = vi.fn<DeviceLocationWatchPort['control']>(async (device, command) => accepted(device, command));
  const watch = new DeviceLocationWatch({ read, control }, changed,
    { nonce: () => `123e4567-e89b-42d3-a456-${(++nonce).toString(16).padStart(12, '0')}` });
  const commands = () => control.mock.calls.map(([, command]) => command);
  return { watch, read, control, changed, current, commands, retireScope: () => { scope = false; } };
}
afterEach(() => vi.useRealTimers());

describe('Private Cloud device location page watch', () => {
  it('does no work before explicit start and stops at a legitimate missing capability', async () => {
    const f = fixture();
    expect(f.watch.snapshot).toMatchObject({ phase: 'idle', latest: null, fresh: false });
    expect(f.read).not.toHaveBeenCalled();
    f.read.mockResolvedValue(detail({ capability: null, sample: null, ageMillis: null, fresh: false }));
    f.watch.start(id, f.current); await turn();
    expect(f.watch.snapshot).toMatchObject({ phase: 'unsupported', fresh: false });
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.read).toHaveBeenCalledOnce(); expect(f.control).not.toHaveBeenCalled();
    f.watch.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('permits no-fix without fabricating zero, and service acceptance is not fresh device evidence', async () => {
    const f = fixture();
    f.read.mockResolvedValue(detail({ sample: null, ageMillis: null, fresh: false }));
    f.watch.start(id, f.current); await turn();
    expect(f.watch.snapshot).toMatchObject({ phase: 'watching', latest: { sample: null },
      lease: { phase: 'active' }, fresh: false, ageMillis: null });
    expect(f.commands()).toEqual([{ operation: 'open', leaseId: expect.any(String), intervalMs: 5000 }]);
    f.watch.destroy(); await turn();
  });

  it('polls serially after completion while renewing the same nonce independently', async () => {
    const f = fixture(), pending = deferred<DeviceLocationTelemetryLatest>();
    f.watch.start(id, f.current); await turn();
    f.read.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(f.read).toHaveBeenCalledTimes(2);
    pending.resolve(detail()); await turn();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.commands().map(command => command.operation)).toEqual(['open', 'renew']);
    expect(new Set(f.commands().map(command => command.leaseId)).size).toBe(1);
    await vi.advanceTimersByTimeAsync(3999); expect(f.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(f.read).toHaveBeenCalledTimes(3);
    f.watch.destroy(); await turn();
  });

  it('renews relative to request start instead of extending TTL by slow response time', async () => {
    const f = fixture(), opening = deferred<DeviceLocationTelemetryLease>();
    f.control.mockReturnValueOnce(opening.promise);
    f.watch.start(id, f.current); await turn();
    await vi.advanceTimersByTimeAsync(7000);
    opening.resolve(accepted(id, f.commands()[0])); await turn();
    await vi.advanceTimersByTimeAsync(2999); expect(f.control).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.commands().map(command => command.operation)).toEqual(['open', 'renew']);
    f.watch.destroy(); await turn();
  });

  it('aborts a pending read on pause, closes with a fresh signal once and fences its late result', async () => {
    const f = fixture(), pending = deferred<DeviceLocationTelemetryLatest>();
    f.watch.start(id, f.current); await turn();
    f.read.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(5000);
    const readSignal = f.read.mock.calls[1][1];
    f.watch.pause(); f.watch.pause(); await turn();
    expect(readSignal.aborted).toBe(true);
    const closeCalls = f.control.mock.calls.filter(([, command]) => command.operation === 'close');
    expect(closeCalls).toHaveLength(1); expect(closeCalls[0][2].aborted).toBe(false);
    pending.resolve(detail({ ageMillis: 0 })); await turn();
    expect(f.watch.snapshot).toMatchObject({ phase: 'paused', latest: { ageMillis: 1000 }, lease: null });
    await vi.advanceTimersByTimeAsync(60000); expect(f.read).toHaveBeenCalledTimes(2);
    f.watch.start(id, f.current); await turn();
    expect(f.commands().filter(command => command.operation === 'open').map(command => command.leaseId))
      .toEqual(['123e4567-e89b-42d3-a456-000000000001', '123e4567-e89b-42d3-a456-000000000002']);
    f.watch.destroy(); await turn();
  });

  it('tombstones an unknown Open once and never resurrects after its late acceptance', async () => {
    const f = fixture(), opening = deferred<DeviceLocationTelemetryLease>();
    f.control.mockReturnValueOnce(opening.promise);
    f.watch.start(id, f.current); await turn();
    const open = f.commands()[0];
    f.watch.pause(); await turn();
    expect(f.commands()).toEqual([open, { operation: 'close', leaseId: open.leaseId }]);
    opening.resolve(accepted(id, open)); await turn();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.watch.snapshot.phase).toBe('paused'); expect(f.control).toHaveBeenCalledTimes(2);
    expect(f.read).toHaveBeenCalledOnce(); f.watch.destroy();
  });

  it('latches a read failure across background return and requires explicit refresh to recover', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.read.mockRejectedValueOnce(Error('read unavailable'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.watch.snapshot).toMatchObject({ phase: 'error', latest: { sample: { latitudeE7: 310000000 } }, lease: null });
    f.watch.pause(); f.watch.start(id, f.current);
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.watch.snapshot.phase).toBe('error'); expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.watch.snapshot.fresh).toBe(false);
    f.watch.refresh(); await turn();
    expect(f.watch.snapshot.phase).toBe('watching'); expect(f.read).toHaveBeenCalledTimes(3);
    f.watch.destroy(); await turn();
  });

  it('bounds a hung read and stops poll/renew rather than automatically retrying', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.read.mockReturnValueOnce(new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.watch.snapshot).toMatchObject({ phase: 'error', error: Error('DEVICE_V2_LOCATION_WATCH_TIMEOUT') });
    expect(f.read.mock.calls[1][1].aborted).toBe(true);
    const count = f.control.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.read).toHaveBeenCalledTimes(2); expect(f.control).toHaveBeenCalledTimes(count);
    f.watch.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('closes a failed renewal only once, without treating late acceptance as recovery', async () => {
    const f = fixture(), renewal = deferred<DeviceLocationTelemetryLease>();
    f.watch.start(id, f.current); await turn();
    f.control.mockReturnValueOnce(renewal.promise);
    await vi.advanceTimersByTimeAsync(10000);
    const command = f.commands().find(item => item.operation === 'renew')!;
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.watch.snapshot.phase).toBe('error');
    renewal.resolve(accepted(id, command)); await turn();
    f.watch.start(id, f.current); await vi.advanceTimersByTimeAsync(60000);
    expect(f.commands().map(item => item.operation)).toEqual(['open', 'renew', 'close']);
    expect(f.watch.snapshot.lease).toBeNull(); f.watch.destroy();
  });

  it('never sends old cleanup with a changed account and clears the old private point', async () => {
    const f = fixture(), reading = deferred<DeviceLocationTelemetryLatest>();
    f.watch.start(id, f.current); await turn();
    f.read.mockReturnValueOnce(reading.promise);
    await vi.advanceTimersByTimeAsync(5000);
    f.retireScope(); f.watch.stop(); await turn();
    expect(f.read.mock.calls[1][1].aborted).toBe(true);
    expect(f.commands().map(item => item.operation)).toEqual(['open']);
    expect(f.watch.snapshot).toMatchObject({ phase: 'idle', latest: null, lease: null, fresh: false });
    reading.resolve(detail()); await turn();
    expect(f.watch.snapshot.latest).toBeNull(); f.watch.destroy();
  });

  it('scope invalidation clears the private point and checks the frozen scope before later calls', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.retireScope(); await vi.advanceTimersByTimeAsync(60000);
    expect(f.commands().map(item => item.operation)).toEqual(['open']);
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.watch.snapshot).toMatchObject({ phase: 'idle', latest: null, lease: null, error: null, fresh: false });
    f.watch.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('scope invalidation aborts any independent cleanup rather than carrying it to the next account', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.control.mockReturnValueOnce(new Promise(() => undefined));
    f.watch.pause();
    const cleanup = f.control.mock.calls.at(-1)![2];
    expect(cleanup.aborted).toBe(false);
    f.retireScope(); f.watch.stop(); await turn();
    expect(cleanup.aborted).toBe(true);
    expect(f.watch.snapshot).toMatchObject({ latest: null, lease: null, error: null, fresh: false });
    expect(vi.getTimerCount()).toBe(0); f.watch.destroy();
  });

  it.each([{ httpStatus: 401 }, { httpStatus: 403 },
    { httpStatus: 404, code: 'DEVICE_V2_DEVICE_NOT_FOUND' },
    { httpStatus: 404, code: 'DEVICE_V2_LOCATION_NOT_FOUND' },
    { httpStatus: 404, code: 'DEVICE_V2_LOCATION_LATEST_NOT_FOUND' },
    { httpStatus: 404, code: 'DEVICE_V2_LOCATION_LEASE_NOT_FOUND' }])
  ('authority failure clears the private point without a cleanup request under lost access: %j', async error => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.read.mockRejectedValueOnce(error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.watch.snapshot).toMatchObject({ phase: 'error', latest: null, lease: null, error, fresh: false });
    expect(f.commands().map(item => item.operation)).toEqual(['open']);
    f.watch.pause(); f.watch.start(id, f.current);
    await vi.advanceTimersByTimeAsync(60000); expect(f.read).toHaveBeenCalledTimes(2);
    f.watch.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('a route-level 404 is not authoritative device loss and retains the last point behind the failure gate', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    const error = { httpStatus: 404, code: 'ROUTE_NOT_FOUND' };
    f.read.mockRejectedValueOnce(error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.watch.snapshot).toMatchObject({ phase: 'error', latest: { sample: { latitudeE7: 310000000 } }, error });
    expect(f.commands().map(item => item.operation)).toEqual(['open', 'close']);
    f.watch.destroy(); await turn();
  });

  it('bounds independent cleanup and never retries a failed or hung Close', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.control.mockReturnValueOnce(new Promise(() => undefined));
    f.watch.pause(); await turn();
    const signal = f.control.mock.calls.at(-1)![2];
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.commands().map(item => item.operation)).toEqual(['open', 'close']);
    f.watch.destroy();
  });

  it('ages fresh evidence monotonically and never promotes a server-fenced point', async () => {
    const f = fixture();
    f.read.mockResolvedValue(detail({ ageMillis: 89000 }));
    f.watch.start(id, f.current); await turn();
    expect(f.watch.snapshot.fresh).toBe(true);
    const notifications = f.changed.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1001);
    expect(f.watch.snapshot).toMatchObject({ fresh: false, ageMillis: 90001 });
    expect(f.changed.mock.calls.length).toBeGreaterThan(notifications);
    f.read.mockResolvedValue(detail({ fresh: false, ageMillis: 0 }));
    await vi.advanceTimersByTimeAsync(3999);
    expect(f.watch.snapshot).toMatchObject({ fresh: false, ageMillis: 0 });
    f.watch.destroy(); await turn();
  });

  it('fails closed on Manifest change without silently rebinding an existing nonce', async () => {
    const f = fixture();
    f.watch.start(id, f.current); await turn();
    f.read.mockResolvedValue(detail({ capability: { codec: 'device-gnss-v1', endpointId: 4,
      manifestFingerprint: 'b'.repeat(64) } }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.watch.snapshot).toMatchObject({ phase: 'error', error: Error('DEVICE_V2_LOCATION_CAPABILITY_CHANGED') });
    expect(f.commands().map(item => item.operation)).toEqual(['open', 'close']);
    await vi.advanceTimersByTimeAsync(60000); expect(f.read).toHaveBeenCalledTimes(2);
    f.watch.destroy();
  });

  it('destroy aborts pending renewal and permanently fences subsequent methods and callbacks', async () => {
    const f = fixture(), pending = deferred<DeviceLocationTelemetryLease>();
    f.watch.start(id, f.current); await turn();
    f.control.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(10000);
    const renewing = f.control.mock.calls.at(-1)!;
    f.watch.destroy(); await turn();
    expect(renewing[2].aborted).toBe(true);
    const count = f.changed.mock.calls.length;
    pending.resolve(accepted(id, renewing[1])); await turn();
    f.watch.start(id, f.current); f.watch.refresh();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.changed).toHaveBeenCalledTimes(count); expect(f.read).toHaveBeenCalledTimes(3);
    expect(f.commands().map(item => item.operation)).toEqual(['open', 'renew', 'close']);
    expect(vi.getTimerCount()).toBe(0);
  });
});
