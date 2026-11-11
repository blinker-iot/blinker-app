import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  start: vi.fn(async (_options: { id: string; services: readonly string[] }) => undefined),
  stop: vi.fn(async (_options: { id: string }) => undefined),
  remove: vi.fn(async () => undefined),
  addListener: vi.fn(async (_name: string, _listener: (event: any) => void): Promise<any> => undefined),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => native }));
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: {}, ScanMode: {} }));
const turn = async () => { for (let i = 0; i < 20; ++i) await Promise.resolve(); };

beforeEach(() => {
  vi.resetAllMocks();
  native.addListener.mockImplementation(async () => ({ remove: native.remove }));
});

describe('Android scan event bridge (not a physical SDK fault injection)', () => {
  it('an asynchronous registration rejection after start resolved settles the observation and closes', async () => {
    const { bleScanner } = await import('./scan');
    const work = bleScanner.run([], 1000, undefined, vi.fn()).catch(e => e);
    await turn();
    const id = native.start.mock.calls[0][0].id;
    native.addListener.mock.calls[0][1]({ id, error: 'BLE_SCAN_REGISTRATION_FAILED' });
    expect((await work).message).toBe('BLE_SCAN_REGISTRATION_FAILED');
    expect(native.stop).toHaveBeenCalledWith({ id }); expect(native.remove).toHaveBeenCalledOnce();
  });
  it('native throttling preserves cooldown rather than becoming a device-not-found timeout', async () => {
    const { bleScanner } = await import('./scan');
    const work = bleScanner.run([], 1000, undefined, vi.fn()).catch(e => e); await turn();
    native.addListener.mock.calls[0][1]({ id: native.start.mock.calls[0][0].id, error: 'BLE_SCAN_THROTTLED', retryAfterMs: 30000 });
    expect(await work).toMatchObject({ message: 'BLE_SCAN_THROTTLED', retryAfterMs: 30000 });
    expect(native.remove).toHaveBeenCalledOnce();
  });
  it('old id callbacks cannot fail or feed a successor, while binary advertisements are decoded', async () => {
    const { bleScanner } = await import('./scan');
    const first = bleScanner.run([], 1000, undefined, vi.fn()).catch(e => e); await turn();
    const oldId = native.start.mock.calls[0][0].id; bleScanner.cancel(); await first;
    const seen = vi.fn(); const second = bleScanner.run([], 1000, undefined, (value, done) => { seen(value); done(); }); await turn();
    const emit = native.addListener.mock.calls[1][1];
    emit({ id: oldId, error: 'BLE_SCAN_BACKGROUND' }); expect(seen).not.toHaveBeenCalled();
    emit({ id: native.start.mock.calls[1][0].id, result: { device: { deviceId: 'transport-hint' }, serviceData: { service: '0102' } } });
    await second; expect(seen.mock.calls[0][0].serviceData.service.getUint16(0)).toBe(0x0102);
  });
  it('cancellation during pending native start retains listener until the real stop barrier', async () => {
    const { bleScanner } = await import('./scan'); let started!: () => void, stopped!: () => void;
    native.start.mockImplementation(() => new Promise<void>(r => { started = r; }));
    native.stop.mockImplementation(() => new Promise<void>(r => { stopped = r; }));
    const work = bleScanner.run([], 1000, undefined, vi.fn()).catch(e => e); await turn();
    bleScanner.cancel(); await turn(); expect(native.stop).not.toHaveBeenCalled();
    started(); await turn(); expect(native.remove).not.toHaveBeenCalled(); stopped();
    expect((await work).message).toBe('BLE_SCAN_CANCELLED'); expect(native.remove).toHaveBeenCalledOnce();
  });
  it('malformed native binary payload closes the observation without returning partial data', async () => {
    const { bleScanner } = await import('./scan'); const seen = vi.fn();
    const work = bleScanner.run([], 1000, undefined, seen).catch(e => e); await turn();
    native.addListener.mock.calls[0][1]({ id: native.start.mock.calls[0][0].id,
      result: { device: { deviceId: 'hint' }, rawAdvertisement: 'not-hex' } });
    expect((await work).message).toBe('BLE_SCAN_RESULT_INVALID'); expect(seen).not.toHaveBeenCalled();
    expect(native.remove).toHaveBeenCalledOnce();
  });
  // This is the process singleton: unknown physical ownership intentionally
  // terminates its usable lifetime. Do not reset private state between assertions.
  it('unknown physical close failure fences new work even after native listener cleanup', async () => {
    const { bleScanner } = await import('./scan');
    native.stop.mockRejectedValue(Error('PRIVATE_SDK_ERROR'));
    const work = bleScanner.run([], 1000, undefined, vi.fn()).catch(e => e); await turn(); bleScanner.cancel();
    expect((await work).message).toBe('BLE_SCAN_CLOSE_FAILED'); expect(native.remove).toHaveBeenCalledOnce();
    await expect(bleScanner.run([], 1000, undefined, vi.fn())).rejects.toThrow('BLE_SCAN_BUSY');
    expect(native.start).toHaveBeenCalledOnce();
  });
});
