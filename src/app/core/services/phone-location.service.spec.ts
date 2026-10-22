import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ get: vi.fn(), watch: vi.fn(), check: vi.fn(), request: vi.fn() }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: {
  getCurrentPosition: native.get, watchPosition: native.watch,
  checkPermissions: native.check, requestPermissions: native.request,
} }));
import { PhoneLocationService } from './phone-location.service';

const position = (longitude: unknown = 0, latitude: unknown = 0) => ({ timestamp: 1000,
  coords: { longitude, latitude, accuracy: 8, altitude: null, altitudeAccuracy: null, speed: null, heading: null } });

describe('PhoneLocationService explicit one-shot native location', () => {
  let service: PhoneLocationService;
  beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); service = new PhoneLocationService(); });
  afterEach(() => {
    expect(native.watch).not.toHaveBeenCalled(); expect(native.check).not.toHaveBeenCalled();
    expect(native.request).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('does nothing on construction, then uses one bounded native fix with explicit zero and WGS84', async () => {
    expect(native.get).not.toHaveBeenCalled(); native.get.mockResolvedValue(position());
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(service.current(controller.signal)).resolves.toEqual({ longitude: 0, latitude: 0,
      coordinateSystem: 'WGS84', accuracyMeters: 8, measuredAt: 1000 });
    expect(native.get).toHaveBeenCalledExactlyOnceWith({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it.each([[-180, -90], [180, 90]])('accepts the valid coordinate boundary %j %j', async (longitude, latitude) => {
    native.get.mockResolvedValue(position(longitude, latitude));
    await expect(service.current(new AbortController().signal)).resolves.toMatchObject({ longitude, latitude, coordinateSystem: 'WGS84' });
    expect(native.get).toHaveBeenCalledOnce();
  });
  it.each([[NaN, 0], [Infinity, 0], [180.1, 0], [0, -90.1], ['0', 0], [0, null], [undefined, 0]])(
    'rejects invalid native coordinates without coercion or retry', async (longitude, latitude) => {
      native.get.mockResolvedValue({ ...position(), coords: { ...position().coords, longitude, latitude } });
      await expect(service.current(new AbortController().signal)).rejects.toMatchObject({ kind: 'unavailable' });
      expect(native.get).toHaveBeenCalledOnce();
    });
  it('does not invent accuracy or a measurement time if the plugin has no valid metadata', async () => {
    native.get.mockResolvedValue({ ...position(), timestamp: NaN, coords: { ...position().coords, accuracy: -1 } });
    await expect(service.current(new AbortController().signal)).resolves.toMatchObject({ accuracyMeters: null, measuredAt: null });
  });
  it.each([
    ['OS-PLUG-GLOC-0003', 'permission'], ['OS-PLUG-GLOC-0008', 'permission'],
    ['OS-PLUG-GLOC-0007', 'disabled'], ['OS-PLUG-GLOC-0009', 'disabled'], ['OS-PLUG-GLOC-0017', 'disabled'],
    ['OS-PLUG-GLOC-0010', 'timeout'], ['OS-PLUG-GLOC-0018', 'unavailable'],
    ['OS-PLUG-GLOC-0002', 'unavailable'], [1, 'permission'], [3, 'timeout'],
  ])('classifies native code %j without exposing its raw message or retrying', async (code, kind) => {
    native.get.mockRejectedValue({ code, message: 'private native details must not escape' });
    const error = await service.current(new AbortController().signal).catch(value => value);
    expect(error).toMatchObject({ kind, name: 'PhoneLocationError' });
    expect(error.message).not.toContain('private'); expect(native.get).toHaveBeenCalledOnce();
  });
  it('does not start native work for an already-aborted page', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(service.current(controller.signal)).rejects.toMatchObject({ kind: 'aborted' });
    expect(native.get).not.toHaveBeenCalled();
  });
  it('aborts immediately and discards a late successful native result after page leave/background', async () => {
    let resolve!: (value: unknown) => void;
    native.get.mockImplementation(() => new Promise(done => { resolve = done; }));
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = service.current(controller.signal), rejected = expect(result).rejects.toMatchObject({ kind: 'aborted' });
    await expect(service.current(new AbortController().signal)).rejects.toMatchObject({ kind: 'pending' });
    controller.abort(); await rejected;
    await expect(service.current(new AbortController().signal)).rejects.toMatchObject({ kind: 'pending' });
    resolve(position(10, 20)); await Promise.resolve();
    await expect(result).rejects.toMatchObject({ kind: 'aborted' });
    expect(native.get).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    native.get.mockResolvedValue(position(30, 40));
    await expect(service.current(new AbortController().signal)).resolves.toMatchObject({ longitude: 30, latitude: 40 });
    expect(native.get).toHaveBeenCalledTimes(2);
  });
  it('bounds an unresponsive permission/native call and ignores late failure without a second call', async () => {
    let reject!: (error: unknown) => void;
    native.get.mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = service.current(controller.signal), rejected = expect(result).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(12000); await rejected;
    await expect(service.current(new AbortController().signal)).rejects.toMatchObject({ kind: 'pending' });
    reject({ code: 'OS-PLUG-GLOC-0003' }); await Promise.resolve(); controller.abort();
    await expect(result).rejects.toMatchObject({ kind: 'timeout' });
    expect(native.get).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    native.get.mockResolvedValue(position());
    await expect(service.current(new AbortController().signal)).resolves.toMatchObject({ longitude: 0, latitude: 0 });
    expect(native.get).toHaveBeenCalledTimes(2);
  });
  it('sanitizes a synchronous plugin failure and releases its deadline/listener', async () => {
    native.get.mockImplementation(() => { throw Error('private native details'); });
    await expect(service.current(new AbortController().signal)).rejects.toMatchObject({ kind: 'unavailable', message: '暂时无法获取手机位置。' });
    expect(native.get).toHaveBeenCalledOnce();
    native.get.mockResolvedValue(position());
    await expect(service.current(new AbortController().signal)).resolves.toMatchObject({ longitude: 0, latitude: 0 });
    expect(native.get).toHaveBeenCalledTimes(2);
  });
});
