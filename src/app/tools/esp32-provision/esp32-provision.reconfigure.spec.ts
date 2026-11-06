import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { API } from '../../configs/api.config';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  getCapabilities: vi.fn(), addListener: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(),
  requestPermissions: vi.fn(), startBleScan: vi.fn(), provision: vi.fn(),
} }));
const id = 'device_11111111-1111-4111-8111-111111111111';
const context = { logicalDeviceId: id, credentialVersion: 7, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const turn = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (v: T) => resolve(v) }; }
const pages: Esp32ProvisionPage[] = [];
const originalAuthority = API.BASE_URL;

function setup(mode: string | null = 'reconfigure', deviceId = id) {
  const management = { readDeviceContextV2: vi.fn(async (_id: string, _signal: AbortSignal) => ({ ...context })),
    createDeviceKeyV2: vi.fn(), rotateDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn() };
  const data = { auth: { uuid: 'owner' } as { uuid?: string } | null, user: {}, sessionEpoch: 1,
    authDataChanged: new Subject<void>(), getDevice: vi.fn(() => ({ logicalDeviceId: id,
      credentialVersion: 1, locator: 'AgICAgICAgICAgICAgICAg', config: { customName: 'Cached name' } })) };
  const visibility = { active: new BehaviorSubject(true) }, user = { getAllInfo: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (cb: () => void) => cb() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn() } as any, management as any,
    user as any, data as any, {} as any, { snapshot: { queryParamMap: {
      get: (key: string) => key === 'mode' ? mode : key === 'logicalDeviceId' ? deviceId : null,
    } } } as any, {} as any, {} as any, visibility as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  return { page, management, data, visibility, user };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({} as any);
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); vi.clearAllTimers(); vi.useRealTimers();
  (API as { BASE_URL: string }).BASE_URL = originalAuthority; vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('AR-2 fresh owner reconfiguration context', () => {
  it('supports the original cancellation contract without the newer throwIfAborted method', async () => {
    const Original = AbortController;
    vi.stubGlobal('AbortController', class extends Original {
      constructor() { super(); Object.defineProperty(this.signal, 'throwIfAborted', { value: undefined }); }
    });
    const f = setup(); await f.page.ngOnInit();
    expect(f.page.canOperate).toBe(true); expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(1);
  });

  it('retains route intent before reading and does not permit provisioning while pending', async () => {
    const f = setup(), read = deferred<typeof context>();
    f.management.readDeviceContextV2.mockReturnValueOnce(read.promise);
    expect(f.page.reconfiguring).toBe(true); expect(f.page.canOperate).toBe(false);
    const init = f.page.ngOnInit(); await turn();
    expect(f.page.phase).toBe('context'); expect(f.page.canOperate).toBe(false);
    expect(WiFiProv.addListener).not.toHaveBeenCalled();
    read.resolve(context); await init; expect(f.page.canOperate).toBe(true);
  });

  it.each([false, true])('reads exact owner detail without relying on a %s warm directory', async warm => {
    const f = setup(); if (!warm) f.data.getDevice.mockReturnValue(undefined as any);
    await f.page.ngOnInit();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledExactlyOnceWith(id, expect.any(AbortSignal));
    expect((f.page as any).reconfigureContext).toEqual(context);
    expect(f.data.getDevice).not.toHaveBeenCalled(); expect(f.user.getAllInfo).not.toHaveBeenCalled();
    expect(f.page.canOperate).toBe(true); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('waits for first empty-account restoration once, not for a whole inventory refresh', async () => {
    const f = setup(); f.data.auth = null; f.data.sessionEpoch = 0;
    const init = f.page.ngOnInit(); await turn();
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    f.data.auth = { uuid: 'owner' }; f.data.sessionEpoch = 1; f.data.authDataChanged.next();
    await init; f.data.authDataChanged.next(); await turn();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(1);
    expect(f.page.canOperate).toBe(true); expect(f.user.getAllInfo).not.toHaveBeenCalled();
  });

  it('keeps failure fenced across foreground/auth events and retries only on explicit restart', async () => {
    const f = setup(); f.management.readDeviceContextV2.mockRejectedValueOnce(Error('fixture-read-failure'));
    await f.page.ngOnInit(); expect(f.page.phase).toBe('error'); expect(f.page.reconfiguring).toBe(true);
    expect(f.page.canOperate).toBe(false);
    f.visibility.active.next(false); await turn(); f.visibility.active.next(true);
    f.data.authDataChanged.next(); await turn();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(1);
    f.page.ionViewWillLeave(); await turn(); await f.page.ionViewWillEnter();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(1);
    await f.page.startOver(); expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(2);
    expect(f.page.canOperate).toBe(true); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('aborts on cached leave and ignores a late result without losing reconfiguration intent', async () => {
    const f = setup(), read = deferred<typeof context>(); f.management.readDeviceContextV2.mockReturnValueOnce(read.promise);
    const init = f.page.ngOnInit(); await turn();
    const signal = f.management.readDeviceContextV2.mock.calls[0]?.[1];
    f.page.ionViewWillLeave(); expect(signal?.aborted).toBe(true);
    read.resolve(context); await init;
    expect((f.page as any).reconfigureContext).toBeUndefined(); expect(f.page.reconfiguring).toBe(true);
    expect(WiFiProv.addListener).not.toHaveBeenCalled();
  });

  it('does not accept a response from the previous account or automatically read for a replacement account', async () => {
    const f = setup(), read = deferred<typeof context>(); f.management.readDeviceContextV2.mockReturnValueOnce(read.promise);
    const init = f.page.ngOnInit(); await turn();
    const signal = f.management.readDeviceContextV2.mock.calls[0]?.[1];
    f.data.auth = { uuid: 'other' }; f.data.sessionEpoch++; f.data.authDataChanged.next();
    expect(signal?.aborted).toBe(true); read.resolve(context); await init;
    expect((f.page as any).reconfigureContext).toBeUndefined(); expect(f.page.canOperate).toBe(false);
    expect(f.management.readDeviceContextV2).toHaveBeenCalledTimes(1);
  });

  it('rejects a late result after the service authority changes', async () => {
    const f = setup(), read = deferred<typeof context>(); f.management.readDeviceContextV2.mockReturnValueOnce(read.promise);
    const init = f.page.ngOnInit(); await turn();
    (API as { BASE_URL: string }).BASE_URL = 'https://other.example'; read.resolve(context); await init;
    expect((f.page as any).reconfigureContext).toBeUndefined(); expect(f.page.canOperate).toBe(false);
    expect(f.page.reconfiguring).toBe(true); expect(WiFiProv.addListener).not.toHaveBeenCalled();
  });

  it('does not overwrite a retained rotation CAS or its UNKNOWN request id on a fresh read', async () => {
    const f = setup(); await f.page.ngOnInit();
    const retained = (f.page as any).reconfigureContext;
    (f.page as any).rotationIdempotencyKey = 'wifiprov-fixture-unknown';
    f.management.readDeviceContextV2.mockResolvedValueOnce({ ...context, credentialVersion: 8 });
    await f.page.startOver();
    expect((f.page as any).reconfigureContext).toBe(retained);
    expect((f.page as any).rotationIdempotencyKey).toBe('wifiprov-fixture-unknown');
    expect(f.page.canOperate).toBe(false); expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('ends the whole initial account/read wait at 15 seconds without an automatic retry', async () => {
    const f = setup(); f.data.auth = null; f.data.sessionEpoch = 0;
    const init = f.page.ngOnInit(); await turn(); await vi.advanceTimersByTimeAsync(15000); await init;
    expect(f.page.phase).toBe('error'); expect(f.page.canOperate).toBe(false);
    f.data.auth = { uuid: 'owner' }; f.data.sessionEpoch = 1; f.data.authDataChanged.next(); await turn();
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
  });

  it('does not downgrade an invalid reconfigure target to new-device creation', async () => {
    const f = setup('reconfigure', ''); await f.page.ngOnInit();
    expect(f.page.reconfiguring).toBe(true); expect(f.page.canOperate).toBe(false);
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled(); expect(f.page.phase).toBe('error');
    await expect((f.page as any).installBlinkerIdentity()).rejects.toThrow();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('preserves ordinary first provisioning without a reconfigure detail request', async () => {
    const f = setup(null); await f.page.ngOnInit();
    expect(f.page.reconfiguring).toBe(false); expect(f.page.canOperate).toBe(true);
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
  });
});
