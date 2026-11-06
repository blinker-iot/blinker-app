import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { Capacitor } from '@capacitor/core';
import { BlinkerConfigOperation } from '../../core/device-v2/provisioning/esp32-wifiprov';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  provision: vi.fn(), connect: vi.fn(), scanWifiNetworks: vi.fn(),
  stopBleScan: vi.fn(), clearState: vi.fn(), disconnect: vi.fn(),
  getProvisioningNetworkState: vi.fn(), getInternetState: vi.fn(),
} }));
const id = 'device_11111111-1111-4111-8111-111111111111';
const context = { logicalDeviceId: id, credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const deviceKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
function info(flags = 0): Uint8Array {
  const value = new Uint8Array(24); value.set([2, BlinkerConfigOperation.GetInfo, 0, flags]);
  value.set(new Uint8Array(16).fill(1), 4); return value;
}
function setup(transport: 'ble' | 'softap' = 'softap', mode: string | null = null) {
  const management = { resolveDeviceInstanceV2: vi.fn(async () => ({ status: 200, data: { device: null } })),
    createDeviceKeyV2: vi.fn(async () => ({ status: 201, data: { device: { ...context, state: 'active', deviceType: 'diy' } } })),
    revealDeviceKeyV2: vi.fn(async () => ({ status: 200, data: { ...context, deviceKey } })),
    rotateDeviceKeyV2: vi.fn(), enableDeviceCloudV2: vi.fn(), getDirectAdminV2: vi.fn(),
    registerDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn(), deleteDeviceV2: vi.fn(), readDeviceStateV2: vi.fn(),
    readDeviceContextV2: vi.fn(async () => ({ ...context })) };
  const user = { getAllInfo: vi.fn(async () => true) }, nav = { navigateRoot: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (cb: () => void) => cb() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn() } as any, management as any, user as any,
    { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), getDevice: vi.fn() } as any,
    { startDirectHandoff: vi.fn() } as any,
    { snapshot: { queryParamMap: { get: (key: string) => key === 'mode' ? mode : id } } } as any,
    nav as any, {} as any, { active: new BehaviorSubject(true) } as any);
  page.selectedDevice = { name: 'fixture', transport, connected: true, security: 1, capabilities: [] };
  page.phase = 'ready'; page.ssid = 'fixture-only';
  const request = vi.fn(async (_endpoint: string, payload: Uint8Array) =>
    payload[1] === BlinkerConfigOperation.GetInfo ? info() : Uint8Array.of(2, payload[1], 0));
  (page as any).provisioningTransport = { request };
  const pending = { requestId: 'wifiprov-fixture-original', name: 'Original name' };
  const store = { load: vi.fn(async () => undefined), prepare: vi.fn(async () => pending),
    bind: vi.fn(), complete: vi.fn() };
  (page as any).allocationStore = store;
  const credentials = { load: vi.fn(async () => undefined), save: vi.fn(), remove: vi.fn() };
  (page as any).controllerCredentials = credentials;
  const release = vi.spyOn(page as any, 'releasePlugin').mockResolvedValue(undefined);
  return { page, management, user, nav, request, store, pending, credentials, release };
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('AR-3c cross-page provisioning Cloud fence', () => {
  const native = WiFiProv as typeof WiFiProv & {
    getProvisioningNetworkState: ReturnType<typeof vi.fn>;
    getInternetState: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    native.getProvisioningNetworkState.mockReset().mockResolvedValue({ softApAttempted: false });
    native.getInternetState.mockReset().mockResolvedValue({ ready: true });
  });

  it('a new page blocks owner detail when the native process remembers a SoftAP attempt', async () => {
    native.getProvisioningNetworkState.mockResolvedValue({ softApAttempted: true });
    const first = setup('ble', 'reconfigure');
    expect(await (first.page as any).loadReconfigureContext()).toBe(false);
    const second = setup('ble', 'reconfigure');
    expect(await (second.page as any).loadReconfigureContext()).toBe(false);
    expect(first.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(second.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(native.getInternetState).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { softApAttempted: 'false' }])('fails closed on an invalid native state %j', async state => {
    native.getProvisioningNetworkState.mockResolvedValue(state);
    const f = setup('ble', 'reconfigure');
    expect(await (f.page as any).loadReconfigureContext()).toBe(false);
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(f.page.statusMessage).toContain('不会自动重试');
  });

  it('does not fall back to Internet ready when the native state method is missing', async () => {
    const method = native.getProvisioningNetworkState;
    try {
      native.getProvisioningNetworkState = undefined as any;
      const f = setup('ble', 'reconfigure');
      expect(await (f.page as any).loadReconfigureContext()).toBe(false);
      expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
      expect(native.getInternetState).not.toHaveBeenCalled();
    } finally { native.getProvisioningNetworkState = method; }
  });

  it('a failed state read stops before any new identity intent or Cloud request', async () => {
    native.getProvisioningNetworkState.mockRejectedValue(Error('fixture-native-unavailable'));
    const f = setup('ble');
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'WIFIPROV_NETWORK_STATE_UNCONFIRMED' });
    expect(f.store.prepare).not.toHaveBeenCalled(); expect(f.credentials.save).not.toHaveBeenCalled();
    for (const method of Object.values(f.management)) expect(method).not.toHaveBeenCalled();
  });

  it('rechecks the account after the async gate, before sending a management request', async () => {
    let resolve!: (value: unknown) => void;
    native.getProvisioningNetworkState.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const f = setup('ble'); const port = (f.page as any).managementPort('ble');
    const work = port.readDeviceStateV2(id);
    (f.page as any).dataService.sessionEpoch++;
    const rejected = expect(work).rejects.toThrow(); resolve({ softApAttempted: false }); await rejected;
    expect(f.management.readDeviceStateV2).not.toHaveBeenCalled();
  });

  it('cancels an owner preflight on leave and does not accept its late clear response', async () => {
    let resolve!: (value: unknown) => void;
    native.getProvisioningNetworkState.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const f = setup('ble', 'reconfigure'); const work = (f.page as any).loadReconfigureContext();
    f.page.ionViewWillLeave(); resolve({ softApAttempted: false });
    expect(await work).toBe(false); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect((f.page as any).reconfigureContext).toBeUndefined();
  });

  it('does not clear a local SoftAP mark if it changes during a native clear read', async () => {
    let resolve!: (value: unknown) => void;
    native.getProvisioningNetworkState.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const f = setup('ble', 'reconfigure'); const work = (f.page as any).loadReconfigureContext();
    (f.page as any).softApNetworkUnconfirmed = true; resolve({ softApAttempted: false });
    expect(await work).toBe(false); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect((f.page as any).softApNetworkUnconfirmed).toBe(true);
  });

  it('keeps BLE UNKNOWN read-only coordination available without replaying a write', async () => {
    const f = setup('ble'); (f.page as any).rotationIdempotencyKey = 'wifiprov-original-UNKNOWN';
    const port = (f.page as any).managementPort('ble'); await port.readDeviceStateV2(id);
    expect(native.getProvisioningNetworkState).toHaveBeenCalled();
    expect(f.management.readDeviceStateV2).toHaveBeenCalledExactlyOnceWith(id);
    expect((f.page as any).rotationIdempotencyKey).toBe('wifiprov-original-UNKNOWN');
    expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('does not accept a Cloud result after the local SoftAP fence changes', async () => {
    const f = setup('ble'); let resolve!: (value: unknown) => void;
    f.management.readDeviceStateV2.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const work = (f.page as any).managementPort('ble').readDeviceStateV2(id);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(f.management.readDeviceStateV2).toHaveBeenCalledOnce();
    (f.page as any).softApNetworkUnconfirmed = true;
    const rejected = expect(work).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    resolve({ fixture: 'late-response' }); await rejected;
    expect(f.management.readDeviceStateV2).toHaveBeenCalledOnce();
  });

  it('does not replace an account fence with a network hint after an awaited native read', async () => {
    let resolve!: (value: unknown) => void;
    native.getProvisioningNetworkState.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const f = setup('ble');
    (f.page as any).allocation = { logicalDeviceId: id }; f.page.phase = 'success'; f.page.result = { success: true };
    const status = f.page.statusMessage, work = f.page.openProvisionedDevice();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    (f.page as any).dataService.sessionEpoch++;
    const rejected = expect(work).rejects.toThrow(); resolve({ softApAttempted: false }); await rejected;
    expect(f.page.statusMessage).toBe(status); expect(f.user.getAllInfo).not.toHaveBeenCalled();
  });
});

describe('AR-3a SoftAP Cloud boundary in the existing identity flow', () => {
  it('does not prepare a new pending Admin before the Cloud prerequisite is accepted', async () => {
    const f = setup(); f.request.mockResolvedValue(info(2));
    (f.page as any).allocation = { ...context, deviceKey, deviceInstanceId: info().slice(4, 20),
      accessEpoch: 1, preserveAccess: false, directBootstrap: true };
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    expect(f.credentials.save).not.toHaveBeenCalled(); expect(f.credentials.remove).not.toHaveBeenCalled();
    expect(f.store.prepare).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('blocks before instance lookup, CREATE or Reveal on SoftAP without replacing the original chain', async () => {
    const f = setup();
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    expect(f.request).toHaveBeenCalledTimes(1);
    for (const method of Object.values(f.management)) expect(method).not.toHaveBeenCalled();
    expect(f.store.prepare).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('does not retry or send WiFi after a SoftAP identity prerequisite is blocked', async () => {
    const f = setup(); await f.page.provision();
    expect(f.page.phase).toBe('error'); expect(f.page.statusMessage).toContain('不会自动重试');
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(WiFiProv.disconnect).not.toHaveBeenCalled();
    for (const method of Object.values(f.management)) expect(method).not.toHaveBeenCalled();
  });

  it('captures the actual device transport before a late GetInfo, not the mutable UI choice', async () => {
    const f = setup(); let done!: (v: Uint8Array) => void;
    f.request.mockReturnValueOnce(new Promise<Uint8Array>(resolve => { done = resolve; }));
    const attempt = (f.page as any).installBlinkerIdentity();
    f.page.transport = 'ble'; f.page.selectedDevice = { ...f.page.selectedDevice!, transport: 'ble' };
    const rejected = expect(attempt).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    done(info()); await rejected; expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
  });

  it('preserves retained reconfiguration CAS and the UNKNOWN rotation identity', async () => {
    const f = setup(); const original = { ...context };
    (f.page as any).reconfigureContext = original; (f.page as any).rotationIdempotencyKey = 'wifiprov-fixture-unknown';
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    expect((f.page as any).reconfigureContext).toBe(original);
    expect((f.page as any).rotationIdempotencyKey).toBe('wifiprov-fixture-unknown');
    expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('keeps the BLE first-allocation and Key-only Install path unchanged', async () => {
    const f = setup('ble'); f.page.transport = 'softap';
    await (f.page as any).installBlinkerIdentity();
    expect(f.management.resolveDeviceInstanceV2).toHaveBeenCalledTimes(1);
    expect(f.management.createDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(f.pending.name, f.pending.requestId, 'diy');
    expect(f.management.revealDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(context);
    expect(f.request.mock.calls.map(call => call[1][1])).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.Install]);
  });

  it('allows an already confirmed local identity to send WiFi without Cloud, then avoids Cloud refresh', async () => {
    const f = setup(); f.request.mockResolvedValue(info(1));
    (f.page as any).allocation = { logicalDeviceId: id, deviceKey: '', deviceInstanceId: info().slice(4, 20),
      accessEpoch: 0, preserveAccess: false, credentialStored: true };
    vi.mocked(WiFiProv.provision).mockResolvedValue({ success: true });
    await f.page.provision();
    expect(WiFiProv.provision).toHaveBeenCalledExactlyOnceWith({ ssid: f.page.ssid, password: undefined });
    expect(f.page.phase).toBe('success'); expect(f.user.getAllInfo).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.page.statusMessage).toContain('互联网');
    for (const method of Object.values(f.management)) expect(method).not.toHaveBeenCalled();
  });

  it('preserves confirmed WiFi success when SoftAP native cleanup remains unconfirmed', async () => {
    const f = setup(); f.request.mockResolvedValue(info(1));
    (f.page as any).allocation = { logicalDeviceId: id, deviceKey: '', deviceInstanceId: info().slice(4, 20),
      accessEpoch: 0, preserveAccess: false, credentialStored: true };
    const result = { success: true }; vi.mocked(WiFiProv.provision).mockResolvedValue(result);
    f.release.mockRejectedValue(Object.assign(Error('fixture-close-unknown'), { code: 'WIFIPROV_CLOSE_UNCONFIRMED' }));
    await f.page.provision();
    expect(f.page.result).toBe(result); expect(f.page.phase).toBe('success');
    expect((f.page as any).closeFailed).toBe(true); expect(f.page.canOperate).toBe(false);
    expect(f.user.getAllInfo).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.page.statusMessage).toContain('不会自动');
  });

  it('does not hide an unconfirmed native close when WiFi has no confirmed result', async () => {
    const f = setup(); (f.page as any).allocation = { logicalDeviceId: id };
    const error = Error('fixture-close-unknown'); f.release.mockRejectedValue(error);
    await expect(f.page.openProvisionedDevice()).rejects.toBe(error);
    expect(f.page.result).toBeUndefined(); expect(f.page.phase).not.toBe('success');
    expect(f.user.getAllInfo).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('does not treat a failed SoftAP connect followed by a BLE UI selection as verified Internet', async () => {
    const f = setup(); vi.mocked(WiFiProv.connect).mockRejectedValueOnce(Error('fixture-connect-failed'));
    await expect((f.page as any).connectSession()).rejects.toThrow('fixture-connect-failed');
    f.page.selectedDevice = { ...f.page.selectedDevice!, transport: 'ble' }; f.page.transport = 'ble';
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
  });

  it('does not use clearState resolution alone as proof for another reconfigure detail read', async () => {
    const f = setup('softap', 'reconfigure');
    (f.page as any).softApNetworkUnconfirmed = true;
    (f.page as any).reconfigureContext = context; (f.page as any).reconfigureReady = true;
    await f.page.startOver();
    expect(f.release).toHaveBeenCalledOnce(); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(f.page.reconfiguring).toBe(true); expect(f.page.canOperate).toBe(false);
    expect(f.page.statusMessage).toContain('不会自动重试');
  });
});
