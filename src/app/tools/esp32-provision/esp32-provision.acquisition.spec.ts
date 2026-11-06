import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { BLINKER_CONFIG_ENDPOINT, BlinkerConfigOperation, encodeBlinkerConfigInfoRequest }
  from '../../core/device-v2/provisioning/esp32-wifiprov';
import { AppVisibilityTransition } from '../../core/services/app-visibility.service';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), getCapabilities: vi.fn(), addListener: vi.fn(),
  createDevice: vi.fn(), connect: vi.fn(), getDeviceInfo: vi.fn(), scanWifiNetworks: vi.fn(),
  startBleScan: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(), provision: vi.fn(),
  sendCustomData: vi.fn(), getProvisioningNetworkState: vi.fn(),
} }));

const sessions = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const native = WiFiProv as typeof WiFiProv & { getProvisioningNetworkState: ReturnType<typeof vi.fn> };
const pages: Esp32ProvisionPage[] = [], pending: Promise<unknown>[] = [];
const turn = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
function tracked<T>(value: Promise<T>): Promise<T> { pending.push(value.catch(() => undefined)); return value; }
function device(session = sessions[0], connected = true) {
  return { name: 'BLINKER_FIXTURE', transport: 'softap' as const, security: 1 as const,
    connected, capabilities: [], localOwner: { kind: 'isolated-softap' as const, version: 1 as const, session } };
}
function rawInfo(): Uint8Array {
  const bytes = new Uint8Array(24); bytes.set([2, BlinkerConfigOperation.GetInfo, 0, 0]);
  bytes.fill(1, 4, 20); return bytes;
}
function setup() {
  const visibility = { active: new BehaviorSubject(true), transitions: new Subject<AppVisibilityTransition>() };
  let sequence = 0;
  const transition = (reason: AppVisibilityTransition['reason']) => {
    visibility.transitions.next({ reason, sequence: ++sequence });
    const active = reason === 'resume';
    // Match the real service: a second false is not emitted by active.
    if (visibility.active.value !== active) visibility.active.next(active);
  };
  const data = { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const management = { createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), rotateDeviceKeyV2: vi.fn(),
    resolveDeviceInstanceV2: vi.fn(), getDirectAdminV2: vi.fn(), registerDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn(),
    enableDeviceCloudV2: vi.fn(), deleteDeviceV2: vi.fn(), readDeviceStateV2: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (work: () => void) => work() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn(async () => ({ present: vi.fn() })) } as any,
    management as any, { getAllInfo: vi.fn() } as any, data as any, {} as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, {} as any, {} as any, visibility as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  page.transport = 'softap'; page.deviceName = 'BLINKER_FIXTURE'; page.ssid = 'fixture-target';
  const model = { created: 0, session: sessions[0] };
  vi.mocked(WiFiProv.createDevice).mockImplementation(async () => {
    model.session = sessions[Math.min(model.created++, 1)]; return device(model.session, false);
  });
  vi.mocked(WiFiProv.connect).mockImplementation(async () => device(model.session));
  vi.mocked(WiFiProv.getDeviceInfo).mockImplementation(async () => device(model.session));
  const raw = { request: vi.fn(async (_endpoint: string, _payload: Uint8Array) => rawInfo()) };
  (page as any).rawProvisioningTransport = raw; // Only the external native custom endpoint boundary.
  return { page, visibility, transition, data, management, model, raw };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' });
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ platform: 'android', softApProvisioning: true } as any);
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined); vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [{ ssid: 'fixture-target', rssi: -40, security: 1 }] });
  native.getProvisioningNetworkState.mockResolvedValue({ softApAttempted: false });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); await Promise.allSettled(pending.splice(0));
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('AR-4 real Page pause-only SoftAP acquisition wiring', () => {
  it('OEM managed captures optional PoP before permission waits and passes the same original value to create and connect', async () => {
    const f = setup(), permission = deferred<{ bluetooth: 'granted'; location: 'granted'; nearbyWifi: 'granted' }>();
    await f.page.ngOnInit(); f.page.provisioningPoP = ' factory PoP ';
    vi.mocked(WiFiProv.requestPermissions).mockReturnValueOnce(permission.promise);
    const work = tracked(f.page.connectSoftAp()); await turn(); f.page.provisioningPoP = 'later UI value';
    permission.resolve({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' }); await work;
    expect(WiFiProv.createDevice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ pop: ' factory PoP ' }));
    expect(vi.mocked(WiFiProv.createDevice).mock.calls[0][0]).not.toHaveProperty('softApPurpose');
    expect(WiFiProv.connect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ pop: ' factory PoP ' }));
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    for (const call of Object.values(f.management)) expect(call).not.toHaveBeenCalled();
  });

  it('OEM managed omits PoP entirely for the existing empty optional input', async () => {
    const f = setup(); await f.page.ngOnInit(); await f.page.connectSoftAp();
    expect(vi.mocked(WiFiProv.createDevice).mock.calls[0][0]).not.toHaveProperty('pop');
    expect(vi.mocked(WiFiProv.connect).mock.calls[0][0]).not.toHaveProperty('pop');
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it.each(['a\0b', 'x'.repeat(65), '温'.repeat(22), ' \t'])('OEM managed rejects malformed PoP %j before any native selection', async value => {
    const f = setup(); await f.page.ngOnInit(); f.page.provisioningPoP = value;
    await f.page.connectSoftAp(); expect(f.page.provisioningPoPError).toContain('1～64');
    expect(WiFiProv.requestPermissions).not.toHaveBeenCalled(); expect(WiFiProv.createDevice).not.toHaveBeenCalled();
    expect(WiFiProv.connect).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('OEM managed retires both the input and captured PoP on true stop without reconnecting', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    f.page.provisioningPoP = ' fixture PoP '; vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = tracked(f.page.connectSoftAp()); await turn(); f.transition('stop'); await work;
    expect(f.page.provisioningPoP).toBe(''); expect((f.page as any).softApSpec).toBeUndefined();
    connection.resolve(device()); f.transition('resume'); await turn();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('OEM managed clears the captured PoP after a failed native connection without retrying', async () => {
    const f = setup(); await f.page.ngOnInit(); f.page.provisioningPoP = ' fixture PoP ';
    vi.mocked(WiFiProv.connect).mockRejectedValueOnce(Error('fixture-native-connect-failed'));
    await f.page.connectSoftAp();
    expect(f.page.provisioningPoP).toBe(''); expect((f.page as any).softApSpec).toBeUndefined();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('buffers connect across pause and requires foreground explicit continue before fresh owner and WiFi scan', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = tracked(f.page.connectSoftAp()); await turn();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); f.transition('pause');
    connection.resolve(device()); await turn();
    expect(f.page.acquisitionWaiting).toBe(true); expect(f.page.canContinueAcquisition).toBe(false);
    expect(f.page.sessionReady).toBe(false); expect(f.page.canProvision).toBe(false);
    expect(WiFiProv.clearState).not.toHaveBeenCalled(); expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled();
    expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled(); expect(f.raw.request).not.toHaveBeenCalled();
    f.transition('resume'); await turn();
    expect(f.page.canContinueAcquisition).toBe(true); expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled();
    expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    f.page.continueAcquisition(); await work;
    expect(WiFiProv.getDeviceInfo).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce();
    expect(f.page.phase).toBe('ready'); expect(f.page.sessionReady).toBe(true);
    expect(f.page.networks.map(x => x.ssid)).toEqual(['fixture-target']);
    expect(f.raw.request).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    for (const call of Object.values(f.management)) expect(call).not.toHaveBeenCalled();
  });

  it('a stop is handled even after pause already made active=false, and late connect cannot scan', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = tracked(f.page.connectSoftAp()); await turn(); f.transition('pause');
    expect(f.visibility.active.value).toBe(false); expect(WiFiProv.clearState).not.toHaveBeenCalled();
    f.transition('stop'); await work; await turn();
    expect(WiFiProv.clearState).toHaveBeenCalledOnce(); expect(f.page.sessionReady).toBe(false);
    connection.resolve(device()); f.transition('resume'); f.page.continueAcquisition(); await turn();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled();
    expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled(); expect(f.page.acquisitionWaiting).toBe(false);
    expect(f.page.canProvision).toBe(false);
  });

  it('leaving the page while the system interaction is paused keeps the original close and generation fence', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = tracked(f.page.connectSoftAp()); await turn(); f.transition('pause'); f.page.ionViewWillLeave();
    await work; await turn(); expect(WiFiProv.clearState).toHaveBeenCalledOnce();
    connection.resolve(device()); f.transition('resume'); f.page.continueAcquisition(); await turn();
    expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled(); expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled();
    expect(f.page.sessionReady).toBe(false);
  });

  it('captures the account before permission/native selection instead of accepting an account changed during permissions', async () => {
    const f = setup(), permission = deferred<any>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.requestPermissions).mockReturnValueOnce(permission.promise);
    const work = tracked(f.page.connectSoftAp()); await turn();
    f.data.sessionEpoch++; // No auth event: the awaited call must still recheck its captured context.
    permission.resolve({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' }); await work;
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(f.page.phase).toBe('error'); expect(f.page.sessionReady).toBe(false);
  });

  it('an account/session change during the pending connect cancels the same owner and rejects its late outcome', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = tracked(f.page.connectSoftAp()); await turn(); f.transition('pause');
    f.data.sessionEpoch++; f.data.authDataChanged.next(); await work; await turn();
    expect(WiFiProv.clearState).toHaveBeenCalledOnce(); connection.resolve(device());
    f.transition('resume'); f.page.continueAcquisition(); await turn();
    expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(f.page.sessionReady).toBe(false); expect(WiFiProv.connect).toHaveBeenCalledOnce();
  });

  it('timeout follows shared close and cannot become ready when close is unconfirmed', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    vi.mocked(WiFiProv.clearState).mockRejectedValueOnce(Object.assign(Error('fixture-close-unconfirmed'), { code: 'WIFIPROV_CLOSE_UNCONFIRMED' }));
    const work = tracked(f.page.connectSoftAp()); await turn();
    await vi.advanceTimersByTimeAsync(90_000); await work; await turn();
    expect(WiFiProv.clearState).toHaveBeenCalledOnce(); expect(f.page.canOperate).toBe(false);
    expect(f.page.sessionReady).toBe(false); expect(f.page.canProvision).toBe(false);
    connection.resolve(device()); await turn(); await f.page.connectSoftAp();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.createDevice).toHaveBeenCalledOnce();
    expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
  });

  it('retains a paused-timeout error for foreground manual recovery without background rendering or unlocking', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    vi.mocked(WiFiProv.clearState).mockRejectedValueOnce(Object.assign(Error('fixture-close-unconfirmed'), { code: 'WIFIPROV_CLOSE_UNCONFIRMED' }));
    const work = tracked(f.page.connectSoftAp()); await turn();
    const connectingStatus = f.page.statusMessage;
    f.transition('pause');
    const render = (f.page as any).cdr.detectChanges as ReturnType<typeof vi.fn>;
    const beforeTimeoutRenders = render.mock.calls.length;
    await vi.advanceTimersByTimeAsync(90_000); await work; await turn();
    expect(f.visibility.active.value).toBe(false); expect(f.page.phase).toBe('error');
    expect(f.page.statusMessage).not.toBe(connectingStatus); expect(f.page.statusMessage.length).toBeGreaterThan(0);
    const retainedFailure = f.page.statusMessage;
    expect(render).toHaveBeenCalledTimes(beforeTimeoutRenders);
    expect(WiFiProv.clearState).toHaveBeenCalledOnce(); expect(f.page.acquisitionWaiting).toBe(false);
    connection.resolve(device()); await turn();
    f.transition('resume'); await turn();
    expect(f.page.phase).toBe('error'); expect(f.page.statusMessage).toBe(retainedFailure);
    expect(render.mock.calls.length).toBeGreaterThan(beforeTimeoutRenders);
    expect(f.page.canOperate).toBe(false); expect(f.page.canProvision).toBe(false);
    expect(f.page.canContinueAcquisition).toBe(false); expect(f.page.sessionReady).toBe(false);
    f.page.continueAcquisition(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.connect).toHaveBeenCalledOnce();
    expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('fresh info from another owner after continue cannot enable the Page or start scanning', async () => {
    const f = setup(), connection = deferred<ReturnType<typeof device>>(); await f.page.ngOnInit();
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const work = tracked(f.page.connectSoftAp()); await turn(); f.transition('pause');
    connection.resolve(device()); await turn(); f.transition('resume');
    vi.mocked(WiFiProv.getDeviceInfo).mockResolvedValueOnce(device(sessions[1]));
    f.page.continueAcquisition(); await work; await turn();
    expect(WiFiProv.getDeviceInfo).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.clearState).toHaveBeenCalledOnce(); expect(f.page.sessionReady).toBe(false);
    expect(f.page.canOperate).toBe(false);
  });

  it('Cloud-to-Local reentry uses the same acquisition helper before its original GetInfo and caller work', async () => {
    const f = setup(); await f.page.ngOnInit(); f.page.provisioningPoP = ' original factory PoP ';
    await tracked(f.page.connectSoftAp()); f.page.provisioningPoP = 'later UI edit';
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce();
    await (f.page as any).provisioningTransport.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest());
    const stages = (f.page as any).softApStages;
    const cloud = tracked(stages.prepareCloud()); await turn(); expect(f.page.handoffWaiting).toBe('cloud');
    f.page.continueHandoff(); await cloud;
    const connection = deferred<ReturnType<typeof device>>(); vi.mocked(WiFiProv.connect).mockReturnValueOnce(connection.promise);
    const localWork = vi.fn(async () => 'fresh-local-result'), local = tracked(stages.local(localWork));
    await turn(); expect(f.page.handoffWaiting).toBe('local'); f.page.continueHandoff(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.connect).toHaveBeenCalledTimes(2);
    f.transition('pause'); connection.resolve(device(sessions[1])); await turn();
    expect(f.page.acquisitionWaiting).toBe(true); expect(f.raw.request).toHaveBeenCalledTimes(1);
    expect(localWork).not.toHaveBeenCalled(); expect(WiFiProv.getDeviceInfo).not.toHaveBeenCalled();
    f.transition('resume'); await turn(); expect(localWork).not.toHaveBeenCalled();
    f.page.continueAcquisition(); expect(await local).toBe('fresh-local-result');
    expect(WiFiProv.getDeviceInfo).toHaveBeenCalledOnce(); expect(f.raw.request).toHaveBeenCalledTimes(2);
    expect(f.raw.request.mock.calls.map(([endpoint, payload]) => [endpoint, ...payload]))
      .toEqual([[BLINKER_CONFIG_ENDPOINT, ...encodeBlinkerConfigInfoRequest()],
        [BLINKER_CONFIG_ENDPOINT, ...encodeBlinkerConfigInfoRequest()]]);
    expect(localWork).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledTimes(1);
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(stages.owner.session).toBe(sessions[1]);
    expect(vi.mocked(WiFiProv.createDevice).mock.calls.map(([spec]) => spec.pop)).toEqual([' original factory PoP ', ' original factory PoP ']);
    expect(vi.mocked(WiFiProv.connect).mock.calls.map(([options]) => options?.pop)).toEqual([' original factory PoP ', ' original factory PoP ']);
  });
});
