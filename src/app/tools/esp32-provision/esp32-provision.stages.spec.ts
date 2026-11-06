import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { BlinkerConfigOperation } from '../../core/device-v2/provisioning/esp32-wifiprov';
import { base64UrlEncode } from '../../core/device-v2/ble-direct/wire';
import { WiFiProvAllocationRecord } from '../../core/device-v2/provisioning/wifiprov-allocation';
import { WiFiProvCloudBoundary, wiFiProvCloudBoundary } from '../../core/device-v2/provisioning/wifiprov-cloud-boundary';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  requestPermissions: vi.fn(), createDevice: vi.fn(), connect: vi.fn(), scanWifiNetworks: vi.fn(),
  provision: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(), disconnect: vi.fn(),
  getProvisioningNetworkState: vi.fn(), getInternetState: vi.fn(),
} }));

const id = 'device_11111111-1111-4111-8111-111111111111';
const context = { logicalDeviceId: id, credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const deviceKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const sessions = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const native = WiFiProv as typeof WiFiProv & {
  getProvisioningNetworkState: ReturnType<typeof vi.fn>;
  getInternetState: ReturnType<typeof vi.fn>;
};
const pages: Esp32ProvisionPage[] = [];
const work: Promise<unknown>[] = [];
const turn = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function tracked<T>(pending: Promise<T>): Promise<T> {
  work.push(pending.catch(() => undefined)); return pending;
}
function info(flags = 0, epoch = 0, instance = 1): Uint8Array {
  const raw = new Uint8Array(24); raw.set([2, BlinkerConfigOperation.GetInfo, 0, flags]);
  raw.fill(instance, 4, 20); new DataView(raw.buffer).setUint32(20, epoch, false); return raw;
}

function setup(transport: 'ble' | 'softap' = 'softap') {
  const management = {
    resolveDeviceInstanceV2: vi.fn(async () => ({ status: 200, data: { device: null } })),
    createDeviceKeyV2: vi.fn(async () => ({ status: 201,
      data: { device: { ...context, state: 'active', deviceType: 'diy' } } })),
    revealDeviceKeyV2: vi.fn(async () => ({ status: 200, data: { ...context, deviceKey } })),
    rotateDeviceKeyV2: vi.fn(), enableDeviceCloudV2: vi.fn(), getDirectAdminV2: vi.fn(),
    registerDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn(), deleteDeviceV2: vi.fn(), readDeviceStateV2: vi.fn(),
    // These stage tests prove the original identity/write chain, not Cloud availability.
    readProvisioningCloudV2: vi.fn(async () => ({ device: { ...context, state: 'active', cloudEnabled: true },
      observation: { kind: 'unavailable', observedAt: Date.now(), deviceInstanceId: null, issuedAt: null, stateUpdatedAt: null } })),
  };
  const user = { getAllInfo: vi.fn(async () => false) }, nav = { navigateRoot: vi.fn() };
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), getDevice: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (cb: () => void) => cb() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn(async () => ({ present: vi.fn() })) } as any, management as any, user as any, data as any,
    { startDirectHandoff: vi.fn() } as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, nav as any, {} as any,
    { active: new BehaviorSubject(true) } as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  page.transport = transport; page.deviceName = 'fixture-device'; page.ssid = 'fixture-target';
  page.blinkerDeviceName = 'Original name';

  // External storage only. WiFiProvAllocation/Retirement and installBlinkerIdentity stay real.
  const pending = { requestId: 'wifiprov-original-stage-request', name: 'Original name' };
  let record: WiFiProvAllocationRecord | undefined;
  const store = { load: vi.fn(async () => record), prepare: vi.fn(async () => record ??= pending),
    bind: vi.fn(async (_instance: Uint8Array, _requestId: string, value: typeof context) => {
      record = { ...record!, context: { ...value } };
    }), complete: vi.fn(async () => { record = undefined; }), findDevice: vi.fn() };
  (page as any).allocationStore = store;
  const credentials = { load: vi.fn(async () => undefined as any),
    inspectForProvisioning: vi.fn(async () => ({ hasAny: false, hasUnconfirmed: false })), findWiFiProv: vi.fn(async () => undefined as any),
    save: vi.fn(), remove: vi.fn() };
  (page as any).controllerCredentials = credentials;

  const model = { flags: 0, epoch: 0, reads: 0, reopenedInfo: undefined as Uint8Array | undefined,
    legacyOwner: false, created: 0, device: undefined as any, operationLog: [] as number[] };
  const raw = { request: vi.fn(async (_endpoint: string, payload: Uint8Array) => {
    model.operationLog.push(payload[1]); // Do not retain a secret-bearing buffer that Admin later zeroizes.
    if (payload[1] === BlinkerConfigOperation.GetInfo) {
      model.reads++;
      return model.reads > 1 && model.reopenedInfo ? model.reopenedInfo.slice() : info(model.flags, model.epoch);
    }
    if (payload[1] === BlinkerConfigOperation.Bootstrap && (model.flags & 2)) {
      model.flags = 7; model.epoch = 1; return Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0);
    }
    if (payload[1] !== BlinkerConfigOperation.Install) throw Error('Unexpected fixture identity operation');
    model.flags |= 1;
    return Uint8Array.of(2, BlinkerConfigOperation.Install, 0);
  }) };
  // Keep the production stage-aware transport; replace only its native endpoint boundary.
  (page as any).rawProvisioningTransport = raw;
  vi.mocked(WiFiProv.createDevice).mockImplementation(async options => {
    const session = sessions[Math.min(model.created++, sessions.length - 1)];
    model.device = { ...options, capabilities: [], connected: false,
      ...(model.legacyOwner ? {} : { localOwner: { kind: 'isolated-softap', version: 1, session } }) };
    return model.device;
  });
  vi.mocked(WiFiProv.connect).mockImplementation(async () => ({ ...model.device, connected: true }));
  const state = () => (page as any).softApStages?.state as string | undefined;
  const operations = () => model.operationLog.slice();
  const connect = async () => {
    if (transport === 'softap') await page.connectSoftAp();
    else { page.selectedDevice = { name: 'fixture-ble', transport: 'ble', connected: true, security: 1, capabilities: [] }; page.phase = 'ready'; }
  };
  return { page, management, user, nav, data, pending, store, credentials, model, raw, state, operations,
    record: () => record, setRecord: (value: WiFiProvAllocationRecord) => { record = value; }, connect };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' });
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [] });
  vi.mocked(WiFiProv.provision).mockResolvedValue({ success: true });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  native.getProvisioningNetworkState.mockResolvedValue({ softApAttempted: false });
  native.getInternetState.mockResolvedValue({ ready: true });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); await Promise.allSettled(work.splice(0));
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('AR-4l isolated access identity preflight, not a manual write capability', () => {
  const active = () => ({ source: 'wifiprov', state: 'active', logicalDeviceId: id, accessEpoch: 1,
    cloudContext: { ...context }, deviceInstanceId: new Uint8Array(16).fill(1),
    controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 15, intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() });

  it('blocks an existing allocation before Cloud, preserves its UNKNOWN reference and never resumes CREATE', async () => {
    const f = setup(); f.model.flags = 2; f.setRecord(f.pending); await f.connect();
    (f.page as any).rotationIdempotencyKey = 'retained-UNKNOWN';
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'WIFIPROV_IDENTITY_UNCONFIRMED' });
    expect(f.record()).toBe(f.pending); expect((f.page as any).rotationIdempotencyKey).toBe('retained-UNKNOWN');
    expect(f.store.prepare).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo]); expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('blocks a pending Admin before Cloud and does not call register, Bootstrap or cleanup', async () => {
    const f = setup(); f.model.flags = 7; f.model.epoch = 1;
    f.credentials.inspectForProvisioning.mockResolvedValue({ hasAny: true, hasUnconfirmed: true }); await f.connect();
    await expect((f.page as any).installBlinkerIdentity()).rejects.toMatchObject({ code: 'WIFIPROV_IDENTITY_UNCONFIRMED' });
    expect(f.management.registerDirectAdminV2).not.toHaveBeenCalled(); expect(f.credentials.save).not.toHaveBeenCalled();
    expect(f.credentials.remove).not.toHaveBeenCalled(); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo]); expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('uses only fresh Cloud reads for an existing root and the original death-backed new-owner network step', async () => {
    const f = setup(); f.model.flags = 7; f.model.epoch = 1;
    f.credentials.inspectForProvisioning.mockResolvedValue({ hasAny: true, hasUnconfirmed: false });
    f.credentials.findWiFiProv.mockImplementation(async () => active()); f.credentials.load.mockImplementation(async () => active());
    f.management.resolveDeviceInstanceV2.mockResolvedValue({ status: 200, data: { device: { ...context } } } as any);
    f.management.getDirectAdminV2.mockResolvedValue({ logicalDeviceId: id, accessEpoch: 1,
      credentialVersion: 1, controllerId: base64UrlEncode(active().controllerId) });
    await f.connect(); const pending = tracked(f.page.provision()); await turn();
    expect(f.state()).toBe('await-cloud'); expect(f.management.getDirectAdminV2).not.toHaveBeenCalled();
    f.page.continueHandoff(); await turn(); expect(f.state()).toBe('await-local');
    expect(f.management.getDirectAdminV2).toHaveBeenCalledExactlyOnceWith(id);
    expect(f.management.revealDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(context);
    f.page.continueHandoff(); await turn();
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.GetInfo]);
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    for (const call of [f.management.registerDirectAdminV2, f.management.resetDirectAdminV2,
      f.management.rotateDeviceKeyV2, f.management.createDeviceKeyV2, f.credentials.save]) expect(call).not.toHaveBeenCalled();
    f.page.cancelHandoff(); await pending;
  });

  it('stops a changed original CAS before Admin checks or the next Local owner', async () => {
    const f = setup(); f.model.flags = 7; f.model.epoch = 1;
    f.credentials.inspectForProvisioning.mockResolvedValue({ hasAny: true, hasUnconfirmed: false });
    f.credentials.findWiFiProv.mockImplementation(async () => active());
    (f.page as any).reconfigureContext = { ...context };
    f.management.resolveDeviceInstanceV2.mockResolvedValue({ status: 200,
      data: { device: { ...context, credentialVersion: 2 } } } as any);
    await f.connect(); const pending = tracked(f.page.provision()); await turn(); f.page.continueHandoff(); await pending;
    expect(f.management.getDirectAdminV2).not.toHaveBeenCalled(); expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('keeps a truly new empty-root transaction on original Bootstrap and requires its ACK before WiFi', async () => {
    const f = setup(); f.model.flags = 2;
    const prepareNew = vi.fn(async () => {
      if (f.record()) throw Error('existing journal'); return f.store.prepare();
    });
    (f.store as any).prepareNew = prepareNew;
    f.management.registerDirectAdminV2.mockImplementation(async (logicalDeviceId: string, controller: Uint8Array) => ({
      logicalDeviceId, controllerId: base64UrlEncode(controller), credentialVersion: 1, accessEpoch: 1,
    }));
    await f.connect(); const pending = tracked(f.page.provision()); await turn(); f.page.continueHandoff(); await turn();
    expect(prepareNew).toHaveBeenCalledOnce();
    // Original Admin fingerprinting uses native WebCrypto, not a microtask-only fixture.
    await vi.waitFor(() => expect(f.state()).toBe('await-local'));
    expect(WiFiProv.provision).not.toHaveBeenCalled();
    f.page.continueHandoff(); await turn();
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.Bootstrap]);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.record()).toMatchObject({ context });
    f.page.cancelHandoff(); await pending;
  });
});

describe('AR-3f real Page and original allocation chain with explicit SoftAP stages', () => {
  it('preserves manual SSID entry after an explicit device scan failure without repeating the scan', async () => {
    const f = setup();
    vi.mocked(WiFiProv.scanWifiNetworks).mockRejectedValueOnce(Object.assign(Error('fixture-explicit-scan-failure'), { code: 'WIFIPROV_SCAN_FAILED' }));
    await f.connect();
    expect(f.state()).toBe('local'); expect(f.page.phase).toBe('ready');
    expect(f.page.statusMessage).toContain('手动输入 SSID');
    expect(f.page.canProvision).toBe(true);
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('does not advertise manual sending when a scan leaves the native owner uncertain', async () => {
    const f = setup();
    vi.mocked(WiFiProv.scanWifiNetworks).mockRejectedValueOnce(Object.assign(Error('fixture-native-uncertain'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await f.connect();
    expect(f.state()).toBe('failed'); expect(f.page.phase).toBe('error');
    expect(f.page.statusMessage).not.toContain('手动输入 SSID'); expect(f.page.canProvision).toBe(false);
    expect(WiFiProv.scanWifiNetworks).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('keeps HTTP behind matching close plus explicit continue, installs after same-root reopen, and preserves WiFi success on final cancel', async () => {
    const f = setup(); await f.connect(); const death = deferred<void>();
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(death.promise);
    const pending = tracked(f.page.provision()); await turn();
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo]); expect(f.state()).toBe('closing');
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.store.prepare).not.toHaveBeenCalled();
    f.page.continueHandoff(); await turn(); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    death.resolve(); await turn(); expect(f.state()).toBe('await-cloud');
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    f.page.continueHandoff(); await turn(); expect(f.state()).toBe('await-local');
    expect(f.management.createDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(f.pending.name, f.pending.requestId, 'diy');
    expect(f.management.revealDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(context);
    expect(f.store.bind).toHaveBeenCalledExactlyOnceWith(expect.any(Uint8Array), f.pending.requestId, context);
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(1); expect(WiFiProv.connect).toHaveBeenCalledTimes(1);
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo]); expect(WiFiProv.provision).not.toHaveBeenCalled();
    f.page.continueHandoff(); await pending;
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2); expect(WiFiProv.connect).toHaveBeenCalledTimes(2);
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.Install]);
    expect(WiFiProv.provision).toHaveBeenCalledExactlyOnceWith({ ssid: f.page.ssid, password: undefined });
    expect(f.page.phase).toBe('error'); expect(f.page.result?.success).toBe(true);
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'unavailable', outcome: 'wifi-connected' });
    expect(f.page.handoffWaiting).toBeUndefined();
    const completed = f.page.completion;
    f.page.cancelHandoff(); await turn();
    expect(f.page.completion).toEqual(completed); expect(f.page.result?.success).toBe(true);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.record()).toMatchObject({ requestId: f.pending.requestId, context });
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.user.getAllInfo).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(native.getInternetState).not.toHaveBeenCalled();
  });

  it.each(['instance', 'epoch', 'root'])('does not write when reopened GetInfo changes %s', async change => {
    const f = setup(); await f.connect(); const pending = tracked(f.page.provision()); await turn();
    expect(f.state()).toBe('await-cloud'); f.page.continueHandoff(); await turn();
    expect(f.state()).toBe('await-local');
    f.model.reopenedInfo = change === 'instance' ? info(0, 0, 2) : change === 'epoch' ? info(0, 1) : info(1);
    f.page.continueHandoff(); await pending;
    expect(f.page.phase).toBe('error'); expect(f.state()).toBe('failed');
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.GetInfo]);
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.credentials.save).not.toHaveBeenCalled();
    expect(f.record()).toMatchObject({ requestId: f.pending.requestId, context });
    expect(f.management.createDeviceKeyV2).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('a legacy owner never acquires a staged Cloud permit from a ready or clear native snapshot', async () => {
    // This deliberately unconfirmed legacy owner must not contaminate another
    // test's process-wide boundary; do not "reset" a production lease to clean up.
    const boundary = new WiFiProvCloudBoundary();
    vi.spyOn(wiFiProvCloudBoundary, 'enter').mockImplementation(() => boundary.enter());
    const f = setup(); f.model.legacyOwner = true; await f.connect(); await tracked(f.page.provision());
    expect(f.state()).toBeUndefined(); expect(f.page.phase).toBe('error');
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled(); expect(f.store.prepare).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(native.getInternetState).not.toHaveBeenCalled();
    await expect((f.page as any).retireSoftApLocal()).rejects.toThrow('WIFIPROV_CLOSE_UNCONFIRMED');
    expect(boundary.blocked).toBe(true);
  });

  it('does not let an isolated owner or explicit continue erase a legacy main-process SoftAP mark', async () => {
    const boundary = new WiFiProvCloudBoundary();
    vi.spyOn(wiFiProvCloudBoundary, 'enter').mockImplementation(() => boundary.enter());
    const f = setup(); await f.connect(); native.getProvisioningNetworkState.mockResolvedValue({ softApAttempted: true });
    await tracked(f.page.provision()); f.page.continueHandoff(); await turn();
    expect(f.page.phase).toBe('error'); expect(f.state()).toBe('failed');
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled(); expect(f.store.prepare).not.toHaveBeenCalled();
    expect((f.page as any).softApNetworkUnconfirmed).toBe(true); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(boundary.blocked).toBe(true);
  });

  it('leaving while close is pending prevents a late close and continue from issuing Cloud or writes', async () => {
    const f = setup(); await f.connect(); const death = deferred<void>();
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(death.promise);
    const pending = tracked(f.page.provision()); await turn(); expect(f.state()).toBe('closing');
    f.page.ionViewWillLeave(); death.resolve(); await pending; await turn(); f.page.continueHandoff(); await turn();
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled(); expect(f.store.prepare).not.toHaveBeenCalled();
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo]); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce();
  });

  it('preserves the original BLE allocation and Install path without stage waits or native reconnection', async () => {
    const f = setup('ble'); await f.connect(); await tracked(f.page.provision());
    expect(f.state()).toBeUndefined(); expect(f.page.phase).toBe('error');
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'unavailable', outcome: 'wifi-connected' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.management.createDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(f.pending.name, f.pending.requestId, 'diy');
    expect(f.management.revealDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(context);
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.Install]);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(WiFiProv.createDevice).not.toHaveBeenCalled();
    expect(WiFiProv.connect).not.toHaveBeenCalled(); expect(native.getInternetState).not.toHaveBeenCalled();
  });
});

describe('AR-4i Page handoff retirement and fresh-context guard', () => {
  async function suspended(stage: 'cloud' | 'local' = 'cloud') {
    const f = setup();
    // No plugin/event fixture substitution in the identity flow. Only skip
    // unrelated initial capability loading for the explicit restart below.
    vi.spyOn(f.page as any, 'preparePage').mockResolvedValue(undefined);
    await f.page.ngOnInit(); await f.connect();
    expect(wiFiProvCloudBoundary.blocked).toBe(true);
    const oldContext = (f.page as any).accountContext;
    const pending = tracked(f.page.provision()); await turn();
    expect(f.state()).toBe('await-cloud'); expect(wiFiProvCloudBoundary.blocked).toBe(false);
    if (stage === 'local') {
      f.page.continueHandoff(); await turn(); expect(f.state()).toBe('await-local');
      expect(f.record()).toMatchObject({ requestId: f.pending.requestId, context });
    }
    (f.page as any).rotationIdempotencyKey = 'original-UNKNOWN-reference';
    const visibility = (f.page as any).visibility;
    visibility.active.next(false); await pending; await turn();
    return { ...f, visibility, oldContext };
  }

  it('retains only a death-backed public intent, then requires explicit restart and new GetInfo before Cloud', async () => {
    const f = await suspended();
    const checkpoint = (f.page as any).suspendedHandoff;
    expect(checkpoint.checkpoint.stage).toBe('cloud'); expect(f.state()).toBe('cancelled');
    expect(JSON.stringify(checkpoint)).not.toContain('deviceKey');
    expect((f.page as any).allocation).toBeUndefined();
    expect((f.page as any).rotationIdempotencyKey).toBe('original-UNKNOWN-reference');
    f.visibility.active.next(true); await turn(); f.page.continueHandoff(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(f.raw.request).toHaveBeenCalledOnce();
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    await f.page.startOver(); await f.connect();
    expect((f.page as any).accountContext).not.toBe(f.oldContext);
    expect((f.page as any).accountContext.generation).toBeGreaterThan(f.oldContext.generation);
    expect((f.page as any).suspendedHandoff).toBe(checkpoint); // start/ready are not fresh context proof.
    const next = tracked(f.page.provision()); await turn();
    expect((f.page as any).suspendedHandoff).toBeUndefined(); expect(f.state()).toBe('await-cloud');
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.GetInfo]);
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); f.page.cancelHandoff(); await next;
  });

  it.each(['instance', 'epoch', 'root'])('rejects fresh %s mismatch before new identity API, intent or write', async change => {
    const f = await suspended(); f.visibility.active.next(true);
    await f.page.startOver(); await f.connect();
    f.model.reopenedInfo = change === 'instance' ? info(0, 0, 2) : change === 'epoch' ? info(4, 1) : info(1);
    await tracked(f.page.provision()); await turn();
    expect(f.page.phase).toBe('error'); expect(f.state()).toBe('cancelled');
    expect(f.operations()).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.GetInfo]);
    expect(f.store.prepare).not.toHaveBeenCalled();
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.credentials.save).not.toHaveBeenCalled();
    expect(wiFiProvCloudBoundary.blocked).toBe(false);
  });

  it('preserves the original durable allocation/CAS and forbids a changed confirmed CAS on restart', async () => {
    const f = await suspended('local'); const record = f.record();
    expect((f.page as any).suspendedHandoff.identity).toEqual(context);
    expect(JSON.stringify((f.page as any).suspendedHandoff)).not.toContain(deviceKey);
    expect((f.page as any).allocation).toBeUndefined();
    f.visibility.active.next(true); (f.page as any).confirmedIdentityContext.credentialVersion++;
    await f.page.startOver(); await turn();
    expect(f.page.phase).toBe('error'); expect(f.record()).toBe(record);
    expect(f.management.createDeviceKeyV2).toHaveBeenCalledOnce();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect((f.page as any).rotationIdempotencyKey).toBe('original-UNKNOWN-reference');
  });

  it('discards the public handoff on account change or leaving, never continues the old run', async () => {
    const f = await suspended();
    f.data.auth = { uuid: 'other-account' }; f.data.sessionEpoch++; f.data.authDataChanged.next();
    expect((f.page as any).suspendedHandoff).toBeUndefined();
    f.visibility.active.next(true); f.page.continueHandoff(); f.page.ionViewWillLeave(); await turn();
    expect(f.raw.request).toHaveBeenCalledOnce(); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('does not clear another page\'s owner after this page fails to enter the Local boundary', async () => {
    const lease = wiFiProvCloudBoundary.enter(), f = setup();
    try {
      await f.connect();
      expect(WiFiProv.createDevice).not.toHaveBeenCalled();
      await expect((f.page as any).retireSoftApLocal()).rejects.toThrow('WIFIPROV_CLOUD_BOUNDARY_BUSY');
      expect(WiFiProv.clearState).not.toHaveBeenCalled(); expect(wiFiProvCloudBoundary.blocked).toBe(true);
      f.page.ngOnDestroy(); await turn(); expect(WiFiProv.clearState).not.toHaveBeenCalled();
    } finally { await lease.retire(async () => undefined); }
  });
});
