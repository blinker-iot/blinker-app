import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { Esp32ProvisionPage } from './esp32-provision.page';
import { API } from 'src/app/configs/api.config';
import { BLINKER_CONFIG_ENDPOINT, decodeBlinkerConfigInfo, encodeBlinkerConfigInfoRequest }
  from '../../core/device-v2/provisioning/esp32-wifiprov';
import { consumeWiFiProvSoftApHandoff, WiFiProvSoftApStages }
  from '../../core/device-v2/provisioning/wifiprov-softap-stages';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), getCapabilities: vi.fn(), addListener: vi.fn(), stopBleScan: vi.fn(),
  clearState: vi.fn(), createDevice: vi.fn(), connect: vi.fn(), getDeviceInfo: vi.fn(), scanWifiNetworks: vi.fn(),
  sendCustomData: vi.fn(), readBlinkerConfigInfo: vi.fn(), provision: vi.fn(), resetWifi: vi.fn(), getProvisioningNetworkState: vi.fn(),
} }));
const pages: Esp32ProvisionPage[] = [];
const turn = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const cap = { platform: 'android', softApProvisioning: true, softApSystemConnectedReadOnly: true };
const permissions = { bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' } as const;
const device = (session = '11111111-1111-4111-8111-111111111111', connected = true) => ({
  name: 'BLINKER_FIXTURE', transport: 'softap' as const, security: 1 as const, connected, capabilities: [],
  localOwner: { kind: 'isolated-softap' as const, version: 1 as const, session },
});

describe('AR-4j Page fixed manual GetInfo', () => {
  const info = () => {
    const bytes = new Uint8Array(24); bytes.set([2, 1, 0, 2]); bytes.fill(1, 4, 20);
    return { base64: btoa(String.fromCharCode(...bytes)), localOwner: device().localOwner };
  };

  it('reads only after matched manual connect, before scan, without opening identity or WiFi writes', async () => {
    const f = await setup();
    vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ ...cap, softApSystemConnectedConfigInfoRead: true } as any);
    vi.mocked(WiFiProv.readBlinkerConfigInfo).mockResolvedValue(info());
    await f.page.connectSoftAp('system-connected');
    expect(f.page.phase).toBe('ready'); expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledExactlyOnceWith();
    expect(vi.mocked(WiFiProv.connect).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(WiFiProv.readBlinkerConfigInfo).mock.invocationCallOrder[0]);
    expect(vi.mocked(WiFiProv.readBlinkerConfigInfo).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(WiFiProv.scanWifiNetworks).mock.invocationCallOrder[0]);
    await f.page.provision(); expect(f.page.canProvision).toBe(false);
    expect((f.page as any).softApStages).toBeUndefined(); expect(WiFiProv.sendCustomData).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('keeps old read-only scan compatibility without pretending a fixed context read occurred', async () => {
    const f = await setup(); await f.page.connectSoftAp('system-connected');
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(WiFiProv.readBlinkerConfigInfo).not.toHaveBeenCalled();
    expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(f.page.canProvision).toBe(false);
  });

  it('retires an UNKNOWN fixed read and never scans, reconnects or writes on foreground return', async () => {
    const f = await setup();
    vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ ...cap, softApSystemConnectedConfigInfoRead: true } as any);
    vi.mocked(WiFiProv.readBlinkerConfigInfo).mockRejectedValue(Object.assign(Error('fixture-unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await f.page.connectSoftAp('system-connected');
    f.visibility.active.next(false); f.visibility.active.next(true); await turn();
    expect(f.page.phase).toBe('error'); expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledOnce();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it.each([true, false])('compares a prior handoff without consuming it (fresh match=%s)', async matches => {
    const f = await setup(), abort = new AbortController();
    const original = device('22222222-2222-4222-8222-222222222222').localOwner;
    const raw = Uint8Array.from(atob(info().base64), value => value.charCodeAt(0));
    const stages = new WiFiProvSoftApStages(original, { signal: abort.signal,
      assertCurrent: vi.fn(), assertCloud: vi.fn(), close: vi.fn(async () => undefined),
      reopen: vi.fn(), waiting: vi.fn() });
    await stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), async () => raw);
    const waiting = stages.prepareCloud(); void waiting.catch(() => undefined); await turn();
    const checkpoint = stages.captureHandoff()!; stages.cancel();
    await expect(waiting).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    const saved = { checkpoint, account: { authority: API.BASE_URL, accountId: f.data.auth.uuid, sessionEpoch: f.data.sessionEpoch } };
    (f.page as any).suspendedHandoff = saved;
    if (!matches) raw[4]++;
    vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ ...cap, softApSystemConnectedConfigInfoRead: true } as any);
    vi.mocked(WiFiProv.readBlinkerConfigInfo).mockResolvedValue({ ...info(), base64: btoa(String.fromCharCode(...raw)) });
    await f.page.connectSoftAp('system-connected'); await turn();
    if (matches) {
      expect(f.page.phase).toBe('ready'); expect((f.page as any).suspendedHandoff).toBe(saved);
      // Read-only matching must leave consumption to the original explicit phase.
      expect(() => consumeWiFiProvSoftApHandoff(checkpoint, device().localOwner, decodeBlinkerConfigInfo(raw))).not.toThrow();
    } else {
      expect(f.page.phase).toBe('error'); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    }
    expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledOnce(); expect(f.page.canProvision).toBe(false);
    expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('a late fixed read after real stop cannot restore the owner, scan or resume identity work', async () => {
    const f = await setup(); let finish!: (value: any) => void;
    vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ ...cap, softApSystemConnectedConfigInfoRead: true } as any);
    vi.mocked(WiFiProv.readBlinkerConfigInfo).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = f.page.connectSoftAp('system-connected'); await turn();
    expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledOnce();
    f.visibility.transitions.next({ reason: 'pause', sequence: 1 }); f.visibility.active.next(false);
    f.visibility.transitions.next({ reason: 'stop', sequence: 2 }); finish(info()); await pending;
    f.visibility.active.next(true); await turn();
    expect(f.page.sessionReady).toBe(false); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledOnce(); expect(WiFiProv.connect).toHaveBeenCalledOnce();
    expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('an old fixed-read finally cannot clear the preparation flag owned by a new explicit run', async () => {
    const f = await setup(); let finish!: (value: any) => void, close!: () => void;
    vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ ...cap, softApSystemConnectedConfigInfoRead: true } as any);
    vi.mocked(WiFiProv.readBlinkerConfigInfo).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const old = f.page.connectSoftAp('system-connected'); await turn();
    f.visibility.active.next(false); await turn(); f.visibility.active.next(true);
    await f.page.startOver();
    const nextOwner = '22222222-2222-4222-8222-222222222222';
    vi.mocked(WiFiProv.createDevice).mockResolvedValue(device(nextOwner, false));
    vi.mocked(WiFiProv.connect).mockResolvedValue(device(nextOwner));
    vi.mocked(WiFiProv.readBlinkerConfigInfo).mockResolvedValue({ ...info(), localOwner: device(nextOwner).localOwner });
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(new Promise(resolve => { close = resolve; }));
    const next = f.page.connectSoftAp('system-connected'); await turn();
    expect((f.page as any).manualPreparing).toBe(true); expect(f.page.operationBusy).toBe(true);
    finish(info()); await old;
    expect((f.page as any).manualPreparing).toBe(true); expect(f.page.operationBusy).toBe(true);
    close(); await next;
    expect((f.page as any).manualPreparing).toBe(false); expect(f.page.phase).toBe('ready');
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(WiFiProv.sendCustomData).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });
});
async function setup() {
  const visibility = { active: new BehaviorSubject(true), transitions: new Subject<any>() };
  const data = { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const management = { createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), resolveDeviceInstanceV2: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (work: () => void) => work() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn(async () => ({ present: vi.fn() })) } as any,
    management as any, { getAllInfo: vi.fn() } as any, data as any, {} as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, {} as any, {} as any, visibility as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  page.transport = 'softap'; page.deviceName = 'BLINKER_FIXTURE'; await page.ngOnInit();
  return { page, visibility, data, management };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue(cap as any);
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue(permissions);
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined); vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.createDevice).mockResolvedValue(device(undefined, false));
  vi.mocked(WiFiProv.connect).mockResolvedValue(device()); vi.mocked(WiFiProv.getDeviceInfo).mockResolvedValue(device());
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [{ ssid: 'router', rssi: -50, security: 1 }] });
  vi.mocked(WiFiProv.getProvisioningNetworkState).mockResolvedValue({ softApAttempted: false });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('AR-4g explicit system-connected read-only Page', () => {
  it.each([undefined, false, 'true'])('refuses old/false/malformed capability %j before native selection', async flag => {
    const f = await setup(); f.page.capabilities = { ...cap, softApSystemConnectedReadOnly: flag } as any;
    await f.page.connectSoftAp('system-connected');
    expect(f.page.phase).toBe('error'); expect(WiFiProv.requestPermissions).not.toHaveBeenCalled();
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
  });

  it('starts a fresh generation only after confirmed close, then connects once and scans without stages/writes', async () => {
    const f = await setup(), before = (f.page as any).generation;
    f.page.softApPassword = 'unused AP secret';
    await f.page.connectSoftAp('system-connected');
    expect((f.page as any).generation).toBe(before + 1);
    expect(WiFiProv.clearState).toHaveBeenCalledOnce();
    expect(vi.mocked(WiFiProv.clearState).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(WiFiProv.createDevice).mock.invocationCallOrder[0]);
    expect(WiFiProv.requestPermissions).toHaveBeenCalledExactlyOnceWith({ transport: 'softap', softApConnectionMode: 'system-connected' });
    expect(WiFiProv.connect).toHaveBeenCalledExactlyOnceWith({ softApPassword: undefined, softApConnectionMode: 'system-connected' });
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(f.page.readOnlySoftAp).toBe(true);
    expect((f.page as any).softApStages).toBeUndefined(); expect(f.page.canProvision).toBe(false);
    await f.page.provision(); f.page.selectNetwork({ ssid: 'ignored', rssi: -1, security: 0 }); f.page.toggleRemember();
    expect(f.page.ssid).toBe(''); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'WIFIPROV_READ_ONLY' });
    expect(() => (f.page as any).managementPort('softap')).toThrow();
    expect(() => (f.page as any).provisioningTransport.request('blinker-config', new Uint8Array())).toThrow();
  });

  it('does not create a worker after unknown close, or consume another connect as fallback', async () => {
    const f = await setup(); vi.mocked(WiFiProv.clearState).mockRejectedValueOnce(Error('close unconfirmed'));
    await f.page.connectSoftAp('system-connected');
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(f.page.phase).toBe('error');
  });

  it.each(['denied', 'prompt'])('requires actual manual location permission %s', async location => {
    const f = await setup(); vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ ...permissions, location } as any);
    await f.page.connectSoftAp('system-connected');
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(f.page.phase).toBe('error');
  });

  it('rechecks freshly negotiated capability after retiring the old generation', async () => {
    const f = await setup(); vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ ...cap, softApSystemConnectedReadOnly: false } as any);
    await f.page.connectSoftAp('system-connected');
    expect(WiFiProv.requestPermissions).not.toHaveBeenCalled(); expect(WiFiProv.createDevice).not.toHaveBeenCalled();
  });

  it('keeps UNKNOWN and performs no automatic retry after an error/foreground return', async () => {
    const f = await setup(), unknown = Object.assign(Error('unchanged unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
    vi.mocked(WiFiProv.connect).mockRejectedValue(unknown);
    await f.page.connectSoftAp('system-connected');
    f.visibility.active.next(false); f.visibility.active.next(true); await turn();
    expect(WiFiProv.connect).toHaveBeenCalledOnce(); expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('blocks parallel manual actions while retirement is pending and does not recapture an edited SSID', async () => {
    const f = await setup(); let release!: () => void;
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const first = f.page.connectSoftAp('system-connected'); await turn();
    expect(f.page.operationBusy).toBe(true); f.page.deviceName = 'OTHER';
    await f.page.connectSoftAp('system-connected'); release(); await first;
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(vi.mocked(WiFiProv.createDevice).mock.calls[0][0].name).toBe('BLINKER_FIXTURE');
    expect(WiFiProv.connect).toHaveBeenCalledOnce();
  });

  it('a true stop still retires pending connect and its late success cannot scan', async () => {
    const f = await setup(); let finish!: (value: any) => void;
    vi.mocked(WiFiProv.connect).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const work = f.page.connectSoftAp('system-connected'); await turn();
    f.visibility.transitions.next({ reason: 'pause', sequence: 1 }); f.visibility.active.next(false);
    f.visibility.transitions.next({ reason: 'stop', sequence: 2 }); finish(device()); await work;
    f.visibility.transitions.next({ reason: 'resume', sequence: 3 }); f.visibility.active.next(true); await turn();
    expect(WiFiProv.scanWifiNetworks).not.toHaveBeenCalled(); expect(WiFiProv.connect).toHaveBeenCalledOnce();
  });

  it('retires a manual scan failure so refresh and foreground return cannot reuse the old owner', async () => {
    const f = await setup();
    vi.mocked(WiFiProv.scanWifiNetworks).mockRejectedValueOnce({ code: 'WIFIPROV_RESPONSE_UNCONFIRMED' });
    await f.page.connectSoftAp('system-connected'); await turn();
    expect(f.page.phase).toBe('error'); expect(f.page.sessionReady).toBe(false);
    expect(f.page.canProvision).toBe(false); expect(WiFiProv.clearState).toHaveBeenCalledTimes(2);
    await f.page.scanWifiNetworks(); f.visibility.active.next(false); f.visibility.active.next(true); await turn();
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(WiFiProv.connect).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('does not replace the clicked account with a new account while waiting for old-owner retirement', async () => {
    const f = await setup(); let release!: () => void;
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const work = f.page.connectSoftAp('system-connected'); await turn();
    f.data.auth = { uuid: 'other-owner' }; ++f.data.sessionEpoch; f.data.authDataChanged.next();
    release(); await work;
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(WiFiProv.connect).not.toHaveBeenCalled();
    expect(f.page.phase).toBe('error');
  });
});
