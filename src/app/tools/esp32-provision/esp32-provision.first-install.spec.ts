import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { base64UrlEncode } from '../../core/device-v2/ble-direct/wire';
import { BlinkerConfigOperation } from '../../core/device-v2/provisioning/esp32-wifiprov';
import type { WiFiProvAllocationRecord } from '../../core/device-v2/provisioning/wifiprov-allocation';
import { createWiFiProvUnknownCheckpoint } from '../../core/device-v2/provisioning/wifiprov-unknown-checkpoint';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), getCapabilities: vi.fn(), addListener: vi.fn(), stopBleScan: vi.fn(),
  clearState: vi.fn(), createDevice: vi.fn(), connect: vi.fn(), getDeviceInfo: vi.fn(), scanWifiNetworks: vi.fn(),
  sendCustomData: vi.fn(), readBlinkerConfigInfo: vi.fn(), bootstrapBlinkerAccess: vi.fn(), provisionBlinkerWifi: vi.fn(),
  provision: vi.fn(), resetWifi: vi.fn(), getProvisioningNetworkState: vi.fn(), getInternetState: vi.fn(),
} }));

const sessions = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const capabilities = { platform: 'android', softApProvisioning: true, softApSystemConnectedReadOnly: true,
  softApSystemConnectedConfigInfoRead: true, softApSystemConnectedFirstInstall: true };
const permissions = { bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' } as const;
const context = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const deviceKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const pop = 'explicit fixture PoP';
const pages: Esp32ProvisionPage[] = [], pendingWork: Promise<unknown>[] = [];
const turn = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
const owner = (session: string) => ({ kind: 'isolated-softap' as const, version: 1 as const, session });
const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const rawInfo = (flags = 2, epoch = 0, instance = 1) => {
  const bytes = new Uint8Array(24); bytes.set([2, BlinkerConfigOperation.GetInfo, 0, flags]); bytes.fill(instance, 4, 20);
  new DataView(bytes.buffer).setUint32(20, epoch, false); return bytes;
};
const ack = (session: string, bytes = Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0)) => ({
  base64: encoded(bytes), localOwner: owner(session),
});
const unavailableCloud = () => ({ device: { ...context, state: 'active', cloudEnabled: true }, observation: {
  kind: 'unavailable', observedAt: Date.now(), deviceInstanceId: null, issuedAt: null, stateUpdatedAt: null,
} }) as any;
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function tracked<T>(work: Promise<T>): Promise<T> { pendingWork.push(work.catch(() => undefined)); return work; }

async function setup() {
  const visibility = { active: new BehaviorSubject(true), transitions: new Subject<any>() };
  const data = { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), getDevice: vi.fn() };
  const management = {
    resolveDeviceInstanceV2: vi.fn(async () => ({ status: 200, data: { device: null } })),
    createDeviceKeyV2: vi.fn(async () => ({ status: 201,
      data: { device: { ...context, state: 'active', deviceType: 'diy' } } })),
    revealDeviceKeyV2: vi.fn(async () => ({ status: 200, data: { ...context, deviceKey } })),
    registerDirectAdminV2: vi.fn(async (logicalDeviceId: string, controller: Uint8Array) => ({
      logicalDeviceId, controllerId: base64UrlEncode(controller), accessEpoch: 1, credentialVersion: 1,
    })),
    getDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn(), rotateDeviceKeyV2: vi.fn(),
    enableDeviceCloudV2: vi.fn(), deleteDeviceV2: vi.fn(), readDeviceStateV2: vi.fn(),
    readProvisioningCloudV2: vi.fn(async () => ({ device: { ...context, state: 'active', cloudEnabled: true },
      observation: { kind: 'online', observedAt: Date.now(), deviceInstanceId: base64UrlEncode(new Uint8Array(16).fill(1)),
        issuedAt: Date.now(), stateUpdatedAt: Date.now() } })),
  };
  const user = { getAllInfo: vi.fn(async () => false) }, nav = { navigateRoot: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (work: () => void) => work() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn(async () => ({ present: vi.fn() })) } as any,
    management as any, user as any, data as any, { startDirectHandoff: vi.fn() } as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, nav as any, {} as any, visibility as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  page.transport = 'softap'; page.deviceName = 'BLINKER_FIXTURE';

  // Only durable/native/network boundaries are doubled. Page, stages, allocation,
  // Admin, fresh-root checks and the fixed first-install port remain production code.
  const prepared = { requestId: 'wifiprov-first-install-fixture', name: 'Fixture device' };
  let record: WiFiProvAllocationRecord | undefined;
  const store = {
    load: vi.fn(async () => record),
    listUnknown: vi.fn(async () => []),
    saveUnknown: vi.fn(async (instance: Uint8Array, identity: typeof context, attemptedAt: number) => {
      if (!record?.context) throw Error('Missing fixture allocation');
      record = { ...record, wifiUnknown: createWiFiProvUnknownCheckpoint(attemptedAt) };
      return { requestId: record.requestId, name: record.name, context: { ...identity },
        deviceInstanceId: instance.slice(), checkpoint: record.wifiUnknown, availability: 'available' as const };
    }),
    clearUnknown: vi.fn(),
    prepare: vi.fn(async () => record ??= { ...prepared }),
    prepareNew: vi.fn(async () => { if (record) throw Error('Existing fixture intent'); return record = { ...prepared }; }),
    bind: vi.fn(async (_instance: Uint8Array, _requestId: string, value: typeof context) => {
      record = { ...record!, context: { ...value } };
    }),
    complete: vi.fn(async () => { record = undefined; }), findDevice: vi.fn(),
  };
  (page as any).allocationStore = store;
  const credentials = { load: vi.fn(async () => undefined as any),
    inspectForProvisioning: vi.fn(async () => ({ hasAny: false, hasUnconfirmed: false })), findWiFiProv: vi.fn(),
    save: vi.fn(async () => undefined), remove: vi.fn() };
  (page as any).controllerCredentials = credentials;
  const model = { selected: undefined as any, created: 0, flags: 2, epoch: 0, instance: 1 };
  vi.mocked(WiFiProv.createDevice).mockImplementation(async options => {
    const session = sessions[Math.min(model.created++, sessions.length - 1)];
    return model.selected = { name: options.name, transport: 'softap' as const, security: 1 as const, connected: false,
      capabilities: [], localOwner: owner(session) };
  });
  vi.mocked(WiFiProv.connect).mockImplementation(async () => model.selected = { ...model.selected, connected: true });
  vi.mocked(WiFiProv.getDeviceInfo).mockImplementation(async () => model.selected);
  vi.mocked(WiFiProv.readBlinkerConfigInfo).mockImplementation(async () => ({
    base64: encoded(rawInfo(model.flags, model.epoch, model.instance)), localOwner: model.selected.localOwner,
  }));
  vi.mocked(WiFiProv.bootstrapBlinkerAccess).mockImplementation(async () => ack(model.selected.localOwner.session));
  vi.mocked(WiFiProv.provisionBlinkerWifi).mockImplementation(async () => ({ success: true, localOwner: model.selected.localOwner }));
  await page.ngOnInit(); page.blinkerDeviceName = prepared.name;
  const state = () => (page as any).softApStages?.state as string | undefined;
  const connect = async () => {
    page.provisioningPoP = pop; await page.connectFirstInstallSoftAp();
    page.ssid = 'fixture-target'; page.password = 'fixture-target-password'; page.blinkerDeviceName = prepared.name;
  };
  const toLocal = async () => {
    const work = tracked(page.provision()); await turn(); expect(state()).toBe('await-cloud');
    page.continueHandoff();
    // Original Admin fingerprinting deliberately uses native WebCrypto.
    await vi.waitFor(() => expect(state()).toBe('await-local'));
    return { work, resume: async () => { page.continueHandoff(); await turn(); } };
  };
  return { page, visibility, data, management, credentials, store, prepared, model, user, nav, state, connect, toLocal,
    record: () => record };
}

function noGenericWrites() {
  expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
  expect(WiFiProv.resetWifi).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue(capabilities as any);
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue(permissions);
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined); vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [{ ssid: 'fixture-target', rssi: -50, security: 1 }] });
  vi.mocked(WiFiProv.getProvisioningNetworkState).mockResolvedValue({ softApAttempted: false });
  vi.mocked(WiFiProv.getInternetState).mockResolvedValue({ processUnbound: true, internet: true, validated: true, ready: true });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); await Promise.allSettled(pendingWork.splice(0));
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('sealed ordinary BLE first-install page boundary', () => {
  async function sealed(loseCreate = false) {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'service-region' ? 'Development' : null });
    const f = await setup(), trace: string[] = [];
    const page = f.page as any;
    vi.spyOn(f.page, 'sealedFirstInstallReady', 'get').mockReturnValue(true);
    page.transport = 'ble'; page.selectedDevice = { name: 'BLINKER_FIXTURE', transport: 'ble', security: 1, connected: true };
    page.provisioningPoP = pop;
    const prepared = { version: 1, deviceInstanceId: base64UrlEncode(new Uint8Array(16).fill(1)),
      requestId: `wifiprov-${'1'.repeat(32)}`, nameDigest: 'a'.repeat(64), phase: 'prepared' };
    let checkpoint: any;
    const set = (phase: string, other = {}) => { trace.push(phase); checkpoint = { ...checkpoint, ...other, phase }; return checkpoint; };
    Object.assign(f.store, {
      sealedInstallationsAvailable: true,
      loadSealedInstallation: vi.fn(async () => checkpoint), listSealedInstallations: vi.fn(async () => checkpoint ? [checkpoint] : []),
      prepareSealedInstallation: vi.fn(async () => set('prepared', prepared)),
      markSealedCreateDispatched: vi.fn(async (_instance, _id, recipientPublicKey) => set('create-dispatched', { recipientPublicKey })),
      bindSealedInstallation: vi.fn(async (_instance, _id, value) => set('card-confirmed', { context: value })),
      markSealedBootstrapDispatched: vi.fn(async () => set('bootstrap-dispatched')),
      markSealedBootstrapAccepted: vi.fn(async () => set('bootstrap-accepted')),
    });
    const create = vi.fn(async (_name, _request, _instance, beforeDispatch) => {
      await beforeDispatch(base64UrlEncode(new Uint8Array(32).fill(2)));
      trace.push('http-create');
      if (loseCreate) throw Error('lost response');
      return { ...context, deviceKey };
    });
    const read = vi.fn(async () => ({ state: 'created', device: context }));
    Object.assign(f.management, { createDeviceForWiFiProvInstallV2: create, readWiFiProvInstallationStatusV2: read });
    vi.mocked(WiFiProv.sendCustomData).mockImplementation(async options => {
      const op = atob(options.data)[1].charCodeAt(0);
      if (op === BlinkerConfigOperation.GetInfo) return { base64: encoded(rawInfo()) };
      expect(op).toBe(BlinkerConfigOperation.Bootstrap); expect(checkpoint.phase).toBe('bootstrap-dispatched');
      trace.push('bootstrap');
      return { base64: encoded(Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0)) };
    });
    return { ...f, internal: page, create, read, trace, checkpoint: () => checkpoint };
  }

  it('keeps both dispatch fences ahead of their sends and never calls the legacy create or reveal', async () => {
    const f = await sealed();
    await f.internal.installBlinkerIdentity();
    expect(f.trace).toEqual(['prepared', 'create-dispatched', 'http-create', 'card-confirmed', 'bootstrap-dispatched', 'bootstrap', 'bootstrap-accepted']);
    expect(f.internal.allocation.deviceKey).toBe('');
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('fences a lost response even after the pilot switch is off and manually reads only its original record', async () => {
    const f = await sealed(true);
    await expect(f.internal.installBlinkerIdentity()).rejects.toThrow('lost response');
    expect(f.checkpoint().phase).toBe('create-dispatched');
    vi.spyOn(f.page, 'sealedFirstInstallReady', 'get').mockReturnValue(false);
    await expect(f.internal.installBlinkerIdentity()).rejects.toThrow('WIFIPROV_SEALED_INSTALLATION_PENDING');
    f.internal.selectedDevice = undefined;
    await f.internal.loadSealedRecoveries();
    expect(f.read).not.toHaveBeenCalled();
    await f.page.checkSealedInstallation(f.page.sealedRecoveries[0]);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.page.sealedRecoveryMessage).toContain('原设备卡已创建');
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(f.trace).not.toContain('bootstrap');
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });
});

describe('AR-4n explicit first-install Page on the original identity/stage chain', () => {
  async function unknownWiFi() {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    // The new operation performs one bounded automatic confirmation phase.
    // An unavailable read ends it; subsequent recovery remains explicitly one-shot.
    f.management.readProvisioningCloudV2.mockResolvedValueOnce(unavailableCloud());
    vi.mocked(WiFiProv.provisionBlinkerWifi).mockRejectedValueOnce(Object.assign(Error('transport ended'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await local.resume(); await local.work; await turn(); return f;
  }

  it('AR-4t persists only a real typed UNKNOWN with its original time, instance and CAS', async () => {
    const f = await unknownWiFi();
    expect(f.store.saveUnknown).toHaveBeenCalledOnce();
    const [instance, identity, attemptedAt] = f.store.saveUnknown.mock.calls[0];
    expect(instance).toEqual(new Uint8Array(16).fill(1)); expect(identity).toEqual(context);
    expect(f.record()?.wifiUnknown?.attemptedAt).toBe(attemptedAt);
    expect(f.page.wifiCheckpointState).toBe('saved'); expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.page.unknownRecoveries).toHaveLength(1); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', cloud: 'unavailable', outcome: 'unconfirmed' });
    await f.page.checkUnknownWiFiCloud(); expect(f.page.wifiCloudState).toBe('online');
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(2);
    expect(f.record()?.wifiUnknown?.status).toBe('unknown'); expect(f.store.saveUnknown).toHaveBeenCalledOnce();
    expect(f.store.complete).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('AR-4t a successful typed terminal creates no UNKNOWN checkpoint even when final Cloud is cancelled', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal(), late = deferred<any>();
    f.management.readProvisioningCloudV2.mockReturnValueOnce(late.promise);
    await local.resume(); expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'checking' });
    f.visibility.active.next(false); await local.work;
    late.resolve({}); await turn();
    expect(f.store.saveUnknown).not.toHaveBeenCalled(); expect(f.record()?.wifiUnknown).toBeUndefined();
    expect(f.page.wifiReceiptUnknown).toBe(false); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); noGenericWrites();
  });

  it('AR-4t uncertain checkpoint storage preserves in-memory UNKNOWN without save or WiFi retries', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    f.store.saveUnknown.mockRejectedValueOnce(Error('Storage unavailable'));
    f.management.readProvisioningCloudV2.mockResolvedValueOnce(unavailableCloud());
    vi.mocked(WiFiProv.provisionBlinkerWifi).mockRejectedValueOnce(Object.assign(Error('unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await local.resume(); await local.work; await turn();
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.wifiCheckpointState).toBe('unconfirmed');
    expect(f.store.saveUnknown).toHaveBeenCalledOnce(); expect(f.record()?.wifiUnknown).toBeUndefined();
    f.visibility.active.next(false); f.visibility.active.next(true); await turn();
    expect(f.store.saveUnknown).toHaveBeenCalledOnce(); expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce();
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); noGenericWrites();
  });

  it('offers explicit recovery after the initial UNKNOWN confirmation; online never rewrites WiFi or completes its journal', async () => {
    const f = await unknownWiFi();
    expect(f.page.provisioningPoP).toBe(''); expect((f.page as any).softApSpec).toBeUndefined();
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.result).toBeUndefined(); expect(f.page.phase).toBe('error');
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    await f.page.startOver(); await f.page.provision();
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce();
    await f.page.checkUnknownWiFiCloud();
    expect(f.page.wifiCloudState).toBe('online'); expect(f.page.wifiReceiptUnknown).toBe(true);
    expect(f.page.result).toBeUndefined(); expect(f.page.phase).toBe('success');
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', cloud: 'online', outcome: 'ready' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(2);
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.user.getAllInfo).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    await f.page.openUnknownWiFiDevice();
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith(`/device/${context.logicalDeviceId}`);
    expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce(); noGenericWrites();
  });

  it('does not query on a ready snapshot before the real owner-death promise resolves', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal(), death = deferred<void>();
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(death.promise);
    vi.mocked(WiFiProv.provisionBlinkerWifi).mockRejectedValueOnce(Object.assign(Error('unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await local.resume(); await turn();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', cloud: 'checking' });
    await f.page.checkUnknownWiFiCloud(); // No overlapping recovery while the operation is still confirming.
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    death.resolve(); await local.work; expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', outcome: 'ready' });
  });

  it('cancels read-only coordination on background, returns without automatic work, and preserves UNKNOWN', async () => {
    const f = await unknownWiFi(), late = deferred<any>();
    const initialReads = f.management.readProvisioningCloudV2.mock.calls.length;
    f.management.readProvisioningCloudV2.mockReturnValueOnce(late.promise);
    const read = f.page.checkUnknownWiFiCloud(); await turn(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(initialReads + 1);
    f.visibility.active.next(false); await read;
    late.resolve({}); f.visibility.active.next(true); await turn();
    f.page.ionViewWillLeave(); await f.page.ionViewWillEnter();
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.wifiCloudState).toBe('idle');
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(initialReads + 1); expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2);
    expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled(); noGenericWrites();
  });

  it.each(['background', 'leave'] as const)('AR-4r submitted WiFi checkpoint survives %s without accepting a late success', async reason => {
    const f = await setup(); await f.connect(); const local = await f.toLocal(), late = deferred<any>();
    vi.mocked(WiFiProv.provisionBlinkerWifi).mockReturnValueOnce(late.promise);
    await local.resume(); expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce();
    expect(f.record()?.context).toEqual(context); expect(f.credentials.save).toHaveBeenCalled();
    if (reason === 'background') f.visibility.active.next(false); else f.page.ionViewWillLeave();
    await local.work; await turn();
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.result).toBeUndefined();
    late.resolve({ success: true, localOwner: owner(sessions[1]) }); await turn();
    if (reason === 'background') f.visibility.active.next(true); else await f.page.ionViewWillEnter();
    await turn(); await f.page.startOver(); await f.page.provision();
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.wifiCloudState).toBe('idle');
    expect(f.page.result).toBeUndefined(); expect(f.page.phase).toBe('error');
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce();
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.user.getAllInfo).not.toHaveBeenCalled();
    await f.page.checkUnknownWiFiCloud();
    expect(f.page.wifiCloudState).toBe('online'); expect(f.page.wifiReceiptUnknown).toBe(true);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('AR-4r submitted WiFi checkpoint is discarded on account change without clearing its durable intent', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal(), late = deferred<any>();
    vi.mocked(WiFiProv.provisionBlinkerWifi).mockReturnValueOnce(late.promise);
    await local.resume(); expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce();
    f.visibility.active.next(false); await local.work; await turn(); expect(f.page.wifiReceiptUnknown).toBe(true);
    const durable = f.record(); expect(durable?.context).toEqual(context);
    f.data.auth = { uuid: 'another-owner' }; f.data.sessionEpoch++; f.data.authDataChanged.next(); await turn();
    late.resolve({ success: true, localOwner: owner(sessions[1]) }); f.visibility.active.next(true); await turn();
    expect(f.page.wifiReceiptUnknown).toBe(false); expect(f.record()).toBe(durable);
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.credentials.remove).not.toHaveBeenCalled();
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce(); noGenericWrites();
  });

  it('AR-4r confirmed WiFi checkpoint cannot become UNKNOWN while final Cloud confirmation is waiting', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal(), late = deferred<any>();
    f.management.readProvisioningCloudV2.mockReturnValueOnce(late.promise);
    await local.resume();
    expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce(); expect(f.page.result).toEqual({ success: true });
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'checking' });
    f.visibility.active.next(false); await local.work; await turn();
    late.resolve({}); await turn();
    expect(f.page.wifiReceiptUnknown).toBe(false);
    f.visibility.active.next(true); await turn();
    expect(f.page.wifiReceiptUnknown).toBe(false); expect(f.page.wifiCloudState).toBe('idle');
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledOnce();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('does not turn a failed read or account change into retry, navigation or confirmed WiFi', async () => {
    const f = await unknownWiFi(); f.management.readProvisioningCloudV2.mockRejectedValueOnce(Error('offline'));
    const initialReads = f.management.readProvisioningCloudV2.mock.calls.length;
    await f.page.checkUnknownWiFiCloud(); expect(f.page.wifiCloudState).toBe('error');
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.result).toBeUndefined();
    f.data.auth = { uuid: 'another-owner' }; f.data.sessionEpoch++; f.data.authDataChanged.next(); await turn();
    expect(f.page.wifiReceiptUnknown).toBe(false); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(initialReads + 1); noGenericWrites();
  });

  it('does not infer a PoP or accept missing/false/malformed native first-install capability', async () => {
    const empty = await setup();
    expect(empty.page.provisioningPoP).toBe(''); expect(empty.page.provisioningPoPVisible).toBe(false);
    empty.page.provisioningPoP = ' \t'; await empty.page.connectFirstInstallSoftAp();
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(empty.management.createDeviceKeyV2).not.toHaveBeenCalled();
    for (const value of [undefined, false, 'true']) {
      const f = await setup(); f.page.capabilities = { ...capabilities, softApSystemConnectedFirstInstall: value } as any;
      f.page.provisioningPoP = pop; expect(f.page.canUseFirstInstall).toBe(false); await f.page.connectFirstInstallSoftAp();
      expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
      expect(f.management.registerDirectAdminV2).not.toHaveBeenCalled();
    }
    noGenericWrites(); expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled();
  });

  it('creates an explicit fresh first-install owner with caller PoP and no generic identity/WiFi writes', async () => {
    const f = await setup(); await f.connect();
    expect(f.page.firstInstallSoftAp).toBe(true); expect(f.page.readOnlySoftAp).toBe(false); expect(f.page.phase).toBe('ready');
    expect(WiFiProv.createDevice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      name: 'BLINKER_FIXTURE', transport: 'softap', security: 1, pop, softApPurpose: 'blinker-first-install',
    }));
    expect(WiFiProv.connect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ pop, softApConnectionMode: 'system-connected' }));
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('rechecks refreshed capability after old owner cleanup before permissions or new create', async () => {
    const f = await setup(); f.page.provisioningPoP = pop;
    expect(f.page.canUseFirstInstall).toBe(true);
    const previousPermissions = vi.mocked(WiFiProv.requestPermissions).mock.calls.length;
    vi.mocked(WiFiProv.getCapabilities).mockResolvedValueOnce({ ...capabilities, softApSystemConnectedFirstInstall: false } as any);
    await f.page.connectFirstInstallSoftAp();
    expect(f.page.canUseFirstInstall).toBe(false); expect(f.page.phase).toBe('error');
    expect(WiFiProv.requestPermissions).toHaveBeenCalledTimes(previousPermissions);
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(f.page.provisioningPoP).toBe('');
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('refuses an absent isolated owner before entering the legacy connect fallback', async () => {
    const f = await setup();
    Object.assign(f.page, { selectedSoftApMode: 'system-connected', firstInstallRequested: true,
      selectedDevice: { name: 'BLINKER_FIXTURE', transport: 'softap', security: 1, connected: false, capabilities: [] } });
    await expect((f.page as any).connectSession()).rejects.toThrow('WIFIPROV_ISOLATED_OWNER_REQUIRED');
    expect(WiFiProv.connect).not.toHaveBeenCalled(); expect(WiFiProv.readBlinkerConfigInfo).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('waits for exact owner death and explicit Cloud/Local phases before one Bootstrap and one WiFi', async () => {
    const f = await setup(); await f.connect(); const death = deferred<void>();
    const previousReads = vi.mocked(WiFiProv.readBlinkerConfigInfo).mock.calls.length;
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(death.promise);
    const work = tracked(f.page.provision()); await turn();
    expect(f.state()).toBe('closing'); expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledTimes(previousReads + 1);
    expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenLastCalledWith();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.store.prepareNew).not.toHaveBeenCalled();
    f.page.continueHandoff(); await turn(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    death.resolve(); await turn(); expect(f.state()).toBe('await-cloud');
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled(); f.page.continueHandoff();
    await vi.waitFor(() => expect(f.state()).toBe('await-local'));
    expect(f.store.prepareNew).toHaveBeenCalledOnce(); expect(f.store.prepare).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(f.prepared.name, f.prepared.requestId, 'diy');
    expect(f.management.registerDirectAdminV2).toHaveBeenCalledOnce(); expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled();
    f.page.continueHandoff(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.connect).toHaveBeenCalledTimes(2);
    expect(WiFiProv.readBlinkerConfigInfo).toHaveBeenCalledTimes(previousReads + 2);
    for (const [spec] of vi.mocked(WiFiProv.createDevice).mock.calls) expect(spec).toMatchObject({ pop, softApPurpose: 'blinker-first-install' });
    for (const [options] of vi.mocked(WiFiProv.connect).mock.calls) expect(options).toMatchObject({ pop, softApConnectionMode: 'system-connected' });
    expect(WiFiProv.bootstrapBlinkerAccess).toHaveBeenCalledOnce();
    const bootstrap = vi.mocked(WiFiProv.bootstrapBlinkerAccess).mock.calls[0][0];
    expect(Object.keys(bootstrap).sort()).toEqual(['base64', 'deviceInstanceIdHex']);
    expect(bootstrap.deviceInstanceIdHex).toBe('01'.repeat(16));
    const bytes = Uint8Array.from(atob(bootstrap.base64), value => value.charCodeAt(0));
    expect(bytes).toHaveLength(101); expect(Array.from(bytes.slice(0, 2))).toEqual([2, BlinkerConfigOperation.Bootstrap]);
    expect(new TextDecoder().decode(bytes.slice(2, 45))).toBe(deviceKey);
    expect(new DataView(bytes.buffer).getUint32(45, false)).toBe(1); expect(new DataView(bytes.buffer).getUint32(65, false)).toBe(1); bytes.fill(0);
    expect(WiFiProv.provisionBlinkerWifi).toHaveBeenCalledExactlyOnceWith({ ssid: 'fixture-target', password: 'fixture-target-password' });
    expect(vi.mocked(WiFiProv.bootstrapBlinkerAccess).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(WiFiProv.provisionBlinkerWifi).mock.invocationCallOrder[0]);
    await work;
    expect(f.page.phase).toBe('success'); expect(f.page.result?.success).toBe(true);
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'online', outcome: 'ready' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.page.result?.success).toBe(true); expect(f.record()).toMatchObject({ requestId: f.prepared.requestId, context });
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.user.getAllInfo).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled(); noGenericWrites();
  });

  it.each(['owner', 'operation', 'length'])('rejects a mismatched Bootstrap %s without WiFi or erasing pending intent', async mismatch => {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    vi.mocked(WiFiProv.bootstrapBlinkerAccess).mockImplementation(async () => mismatch === 'owner' ? ack(sessions[0])
      : ack(sessions[1], mismatch === 'operation' ? Uint8Array.of(2, BlinkerConfigOperation.Install, 0)
        : Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0, 0)));
    await local.resume(); await local.work;
    expect(f.page.phase).toBe('error'); expect(WiFiProv.bootstrapBlinkerAccess).toHaveBeenCalledOnce();
    expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled(); expect(f.record()).toMatchObject({ requestId: f.prepared.requestId, context });
    expect(f.credentials.save.mock.calls.some(([credential]: any[]) => credential.state === 'active')).toBe(false);
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.credentials.remove).not.toHaveBeenCalled();
    f.visibility.active.next(false); f.visibility.active.next(true); await turn();
    expect(WiFiProv.bootstrapBlinkerAccess).toHaveBeenCalledOnce(); expect(f.management.createDeviceKeyV2).toHaveBeenCalledOnce(); noGenericWrites();
  });

  it('blocks an already installed root before any Cloud allocation or Admin mutation', async () => {
    const f = await setup(); f.model.flags = 7; f.model.epoch = 1; await f.connect(); await f.page.provision();
    expect(f.page.phase).toBe('error'); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.registerDirectAdminV2).not.toHaveBeenCalled();
    expect(f.store.prepareNew).not.toHaveBeenCalled(); expect(f.credentials.save).not.toHaveBeenCalled();
    expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('a late ACK after true stop cannot send WiFi or automatically resume UNKNOWN on foreground return', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal(), result = deferred<ReturnType<typeof ack>>();
    vi.mocked(WiFiProv.bootstrapBlinkerAccess).mockReturnValueOnce(result.promise); await local.resume();
    expect(WiFiProv.bootstrapBlinkerAccess).toHaveBeenCalledOnce();
    f.visibility.transitions.next({ reason: 'pause', sequence: 1 }); f.visibility.active.next(false);
    f.visibility.transitions.next({ reason: 'stop', sequence: 2 }); result.resolve(ack(sessions[1])); await local.work;
    f.visibility.transitions.next({ reason: 'resume', sequence: 3 }); f.visibility.active.next(true); await turn();
    expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled(); expect(WiFiProv.bootstrapBlinkerAccess).toHaveBeenCalledOnce();
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(f.record()).toMatchObject({ requestId: f.prepared.requestId, context });
    expect(f.store.complete).not.toHaveBeenCalled(); noGenericWrites();
  });

  it('cannot upgrade an already connected read-only owner; only a new explicit create gets the purpose', async () => {
    const f = await setup(); await f.page.connectSoftAp('system-connected');
    expect(f.page.readOnlySoftAp).toBe(true); expect(f.page.firstInstallSoftAp).toBe(false);
    f.page.provisioningPoP = pop; await f.page.connectFirstInstallSoftAp();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(vi.mocked(WiFiProv.createDevice).mock.calls[0][0].softApPurpose).toBeUndefined();
    expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled();
    await f.page.startOver(); f.page.provisioningPoP = pop; await f.page.connectFirstInstallSoftAp();
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2);
    expect(vi.mocked(WiFiProv.createDevice).mock.calls[1][0]).toMatchObject({ softApPurpose: 'blinker-first-install', pop });
    expect(f.page.firstInstallSoftAp).toBe(true); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); noGenericWrites();
  });
});
