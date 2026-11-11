import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WiFiProv } from 'capacitor-wifiprov';
import { environment } from '../../../environments/environment';
import { getServiceRegion, setServiceRegion } from '../../configs/service-region.config';
import { base64UrlEncode } from '../../core/device-v2/ble-direct/wire';
import { Esp32ProvisionPage } from './esp32-provision.page';

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  getItem: async (key: string) => secure.get(key) ?? null,
  setItem: async (key: string, value: string) => { secure.set(key, value); },
} }));

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  getCapabilities: vi.fn(), requestPermissions: vi.fn(), addListener: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(),
  createDevice: vi.fn(), connect: vi.fn(), getDeviceInfo: vi.fn(), scanWifiNetworks: vi.fn(), readBlinkerConfigInfo: vi.fn(),
  provisionBlinkerWifiOnly: vi.fn(), bootstrapBlinkerAccess: vi.fn(), provisionBlinkerWifi: vi.fn(),
  provision: vi.fn(), sendCustomData: vi.fn(), resetWifi: vi.fn(), getProvisioningNetworkState: vi.fn(), getInternetState: vi.fn(),
} }));

const capabilities = { platform: 'android', softApProvisioning: true, softApSystemConnectedReadOnly: true,
  softApSystemConnectedConfigInfoRead: true, softApSystemConnectedFirstInstall: true, softApSystemConnectedWifiReconfigure: true };
const context = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 2,
  locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const instance = new Uint8Array(16).fill(1), controller = new Uint8Array(16).fill(2);
const sessions = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const owner = (session: string) => ({ kind: 'isolated-softap' as const, version: 1 as const, session });
const turn = async () => { for (let i = 0; i < 200; ++i) await Promise.resolve(); };
const pages: Esp32ProvisionPage[] = [], pending: Promise<unknown>[] = [];
function deferred<T>() { let resolve!: (value: T) => void; return {
  promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value),
}; }

async function setup(reconfigure = true, mode: 'system-connected' | 'sdk-managed' = 'system-connected') {
  const visibility = { active: new BehaviorSubject(true), transitions: new Subject<any>() };
  const data = { auth: { uuid: 'fixture-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const management = {
    readDeviceContextV2: vi.fn(async () => ({ ...context })),
    resolveDeviceInstanceV2: vi.fn(async () => ({ data: { device: { ...context, name: 'Original device' } } })),
    getDirectAdminV2: vi.fn(async () => ({ logicalDeviceId: context.logicalDeviceId, controllerId: base64UrlEncode(controller),
      accessEpoch: 1, credentialVersion: 1 })),
    readProvisioningCloudV2: vi.fn(async () => ({ device: { ...context, state: 'active', cloudEnabled: true },
      observation: { kind: 'online', observedAt: Date.now(), deviceInstanceId: base64UrlEncode(instance),
        issuedAt: Date.now(), stateUpdatedAt: Date.now() } })),
    createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), rotateDeviceKeyV2: vi.fn(), registerDirectAdminV2: vi.fn(),
    resetDirectAdminV2: vi.fn(), enableDeviceCloudV2: vi.fn(), deleteDeviceV2: vi.fn(), readDeviceStateV2: vi.fn(),
  };
  const nav = { navigateRoot: vi.fn(async () => true) };
  const page = new Esp32ProvisionPage({ run: (work: () => void) => work() } as any,
    { detectChanges: vi.fn() } as any, { create: vi.fn(async () => ({ present: vi.fn() })) } as any,
    management as any, { getAllInfo: vi.fn(async () => true) } as any, data as any, { startDirectHandoff: vi.fn() } as any,
    { snapshot: { queryParamMap: { get: (key: string) => !reconfigure ? null
      : key === 'mode' ? 'reconfigure' : key === 'logicalDeviceId' ? context.logicalDeviceId : null } } } as any,
    nav as any, {} as any, visibility as any);
  Object.defineProperty(page, 'nativeSupported', { value: true }); pages.push(page);
  page.transport = 'softap'; page.deviceName = 'BLINKER_FIXTURE';
  // Deliberately present a historical UNKNOWN. This independent network-only
  // transaction must neither load/replay it nor overwrite/complete it.
  const historical = Object.freeze({ requestId: 'old-unknown-fixture', phase: 'unknown', context: { ...context } });
  const store = Object.fromEntries(['load', 'listUnknown', 'saveUnknown', 'clearUnknown', 'prepare', 'prepareNew', 'bind', 'complete']
    .map(name => [name, vi.fn(async () => historical)]));
  (page as any).allocationStore = store;
  const credentials = { load: vi.fn(async () => ({ source: 'wifiprov', state: 'active', logicalDeviceId: context.logicalDeviceId,
    deviceInstanceId: instance.slice(), accessEpoch: 1, controllerId: controller.slice(), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 0x0f, cloudContext: { credentialVersion: context.credentialVersion, locator: context.locator } })),
    save: vi.fn(), remove: vi.fn(), findWiFiProv: vi.fn(), recordWiFiProvRekey: vi.fn(async () => undefined) };
  (page as any).controllerCredentials = credentials;
  const model = { selected: undefined as any, created: 0, flags: 7, epoch: 1, instance: 1 };
  vi.mocked(WiFiProv.createDevice).mockImplementation(async options => model.selected = {
    name: options.name, transport: 'softap' as const, security: 1 as const, connected: false, capabilities: [],
    localOwner: owner(sessions[Math.min(model.created++, sessions.length - 1)]),
  });
  vi.mocked(WiFiProv.connect).mockImplementation(async () => model.selected = { ...model.selected, connected: true });
  vi.mocked(WiFiProv.getDeviceInfo).mockImplementation(async () => model.selected);
  const configInfo = () => {
    const bytes = new Uint8Array(24); bytes.set([2, 1, 0, model.flags]); bytes.fill(model.instance, 4, 20);
    new DataView(bytes.buffer).setUint32(20, model.epoch, false);
    return { base64: btoa(String.fromCharCode(...bytes)), localOwner: model.selected.localOwner };
  };
  vi.mocked(WiFiProv.readBlinkerConfigInfo).mockImplementation(async () => configInfo());
  vi.mocked(WiFiProv.sendCustomData).mockImplementation(async options => {
    if (options.endpoint !== 'blinker-config' || options.data !== 'AgE=' || options.encoding !== 'base64') {
      throw Error('Unexpected identity write or custom endpoint');
    }
    const result = configInfo();
    return { ...result, data: result.base64, encoding: 'base64' };
  });
  vi.mocked(WiFiProv.provisionBlinkerWifiOnly).mockImplementation(async () => ({ success: true, localOwner: model.selected.localOwner }));
  vi.mocked(WiFiProv.provision).mockResolvedValue({ success: true });
  await page.ngOnInit();
  const state = () => (page as any).softApStages?.state as string | undefined;
  const connect = async () => {
    page.provisioningPoP = 'explicit fixture PoP';
    if (mode === 'sdk-managed') await page.connectSoftAp();
    else await page.connectWifiReconfigureSoftAp();
    page.ssid = 'fixture-target'; page.password = 'fixture-password';
  };
  const begin = async () => { const work = page.provision(); pending.push(work); await turn(); return { work }; };
  const toLocal = async () => {
    const { work } = await begin(); expect(state()).toBe('await-cloud'); page.continueHandoff(); await turn();
    expect(state()).toBe('await-local'); return { work, resume: async () => { page.continueHandoff(); await turn(); } };
  };
  return { page, data, visibility, management, credentials, store, historical, nav, model, state, connect, begin, toLocal };
}

function noIdentityWrites(f: Awaited<ReturnType<typeof setup>>, managed = false) {
  for (const name of ['createDeviceKeyV2', 'revealDeviceKeyV2', 'rotateDeviceKeyV2', 'registerDirectAdminV2',
    'resetDirectAdminV2', 'enableDeviceCloudV2', 'deleteDeviceV2'] as const) expect(f.management[name]).not.toHaveBeenCalled();
  expect(f.credentials.save).not.toHaveBeenCalled(); expect(f.credentials.remove).not.toHaveBeenCalled();
  for (const operation of Object.values(f.store)) expect(operation).not.toHaveBeenCalled();
  expect(f.historical.phase).toBe('unknown');
  if (managed) {
    for (const [request] of vi.mocked(WiFiProv.sendCustomData).mock.calls) {
      expect(request).toEqual({ endpoint: 'blinker-config', data: 'AgE=', encoding: 'base64' });
    }
    expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled();
  } else {
    expect(WiFiProv.sendCustomData).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
  }
  expect(WiFiProv.bootstrapBlinkerAccess).not.toHaveBeenCalled();
  expect(WiFiProv.provisionBlinkerWifi).not.toHaveBeenCalled();
  expect(WiFiProv.resetWifi).not.toHaveBeenCalled();
}

beforeEach(() => {
  secure.clear();
  vi.resetAllMocks(); vi.useFakeTimers(); vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue(capabilities as any);
  vi.mocked(WiFiProv.requestPermissions).mockResolvedValue({ bluetooth: 'granted', location: 'granted', nearbyWifi: 'granted' });
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined); vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.getProvisioningNetworkState).mockResolvedValue({ softApAttempted: false });
  vi.mocked(WiFiProv.getInternetState).mockResolvedValue({ processUnbound: true, internet: true, validated: true, ready: true });
  vi.mocked(WiFiProv.scanWifiNetworks).mockResolvedValue({ networks: [{ ssid: 'fixture-target', rssi: -50, security: 1 }] });
});

it('a rekey beta does not use either legacy Wi-Fi writer when the BLE firmware lacks the new capability', async () => {
  const originalOperation = environment.wifiProvRekeyPilotOperation, originalRegion = getServiceRegion();
  const gateway = vi.spyOn(globalThis, 'fetch');
  try {
    environment.wifiProvRekeyPilotOperation = base64UrlEncode(new Uint8Array(16).fill(9));
    setServiceRegion('Development');
    const f = await setup();
    f.page.transport = 'ble';
    f.page.setTransport('softap');
    expect(f.page.transport).toBe('ble');
    await f.page.connectWifiReconfigureSoftAp();
    expect(WiFiProv.createDevice).not.toHaveBeenCalled();
    f.model.selected = { name: 'original', transport: 'ble', security: 1, connected: true, capabilities: [] };
    f.page.selectedDevice = f.model.selected;
    f.page.ssid = 'fixture-target';
    await f.page.provision();
    expect(f.page.statusMessage).toContain('当前固件不支持');
    expect(WiFiProv.sendCustomData).toHaveBeenCalledExactlyOnceWith({ endpoint: 'blinker-config', data: 'AgE=', encoding: 'base64' });
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled();
    expect(gateway).not.toHaveBeenCalled();
  } finally {
    environment.wifiProvRekeyPilotOperation = originalOperation;
    setServiceRegion(originalRegion);
    gateway.mockRestore();
  }
});

it('the existing page commits the exact new key before a single native Wi-Fi call and does not invent Cloud success', async () => {
  const originalOperation = environment.wifiProvRekeyPilotOperation, originalRegion = getServiceRegion();
  const encoded = (byte: number, length = 16) => base64UrlEncode(new Uint8Array(length).fill(byte));
  const operation = encoded(9), newLocator = encoded(6);
  const calls: string[] = [];
  const gateway = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = String(input), action = url.split('/').at(-1);
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer fixture-token', 'X-Region': 'Development' });
    expect(JSON.parse(String(options?.body))).toMatchObject({ logicalDeviceId: context.logicalDeviceId });
    const common = { logicalDeviceId: context.logicalDeviceId, operationId: operation, fromVersion: 2, toVersion: 3 };
    const binding = { operationId: operation, challenge: encoded(5), instance: encoded(1), accessEpoch: 1, fromVersion: 2,
      oldLocator: context.locator };
    const data = action === 'prepare' ? { ...common, state: 'prepared', binding }
      : action === 'issue' ? { ...common, state: 'key_issued', newLocator, transfer: { iv: encoded(2, 12), box: encoded(4, 48) } }
      : { ...common, state: 'committed', newLocator, wifiPermit: encoded(7, 32) };
    calls.push(String(action));
    const response = new Response(JSON.stringify({ status: 200, data }), { headers: { 'Cache-Control': 'no-store' } });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  try {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    environment.wifiProvRekeyPilotOperation = operation;
    setServiceRegion('Development');
    const f = await setup();
    Object.assign(f.data.auth, { accessToken: 'fixture-token' });
    f.page.transport = 'ble'; f.model.flags = 15;
    f.model.selected = { name: 'original', transport: 'ble', security: 1, connected: true, capabilities: [] };
    f.page.selectedDevice = f.model.selected;
    f.page.ssid = 'fixture-target'; f.page.password = 'fixture-password';
    const getInfo = vi.mocked(WiFiProv.sendCustomData).getMockImplementation()!;
    vi.mocked(WiFiProv.sendCustomData).mockImplementation(async request => {
      const bytes = Uint8Array.from(atob(String(request.data)), char => char.charCodeAt(0));
      const op = bytes[1]; calls.push(`local:${op}`);
      if (op === 1) return getInfo(request);
      const payload = op === 8 ? new Uint8Array(16).fill(8)
        : Uint8Array.from([...new Uint8Array(16).fill(9), ...((op === 4 || op === 5) ? new Uint8Array(32).fill(5) : [])]);
      const base64 = btoa(String.fromCharCode(2, op, 0, ...payload));
      return { encoding: 'base64', data: base64, base64 };
    });
    vi.mocked(WiFiProv.provision).mockImplementation(async () => {
      calls.push('wifi'); f.page.selectedDevice = undefined; // The official terminal may close the setup owner.
      return { success: true };
    });
    await f.page.provision();
    expect(calls).toEqual(['local:1', 'prepare', 'local:8', 'local:9', 'local:4', 'issue', 'local:5', 'confirm', 'local:7', 'wifi']);
    expect(f.credentials.recordWiFiProvRekey).toHaveBeenCalledExactlyOnceWith(context.logicalDeviceId, expect.any(Object),
      { credentialVersion: 3, locator: newLocator }, expect.any(Function));
    expect(WiFiProv.provision).toHaveBeenCalledExactlyOnceWith({ ssid: 'fixture-target', password: 'fixture-password' });
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'wifi-connected' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledExactlyOnceWith(new Uint8Array(16).fill(1),
      { ...context, credentialVersion: 3, locator: newLocator }, expect.any(AbortSignal));
    expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect([...secure.values()][0]).not.toMatch(/fixture-password|controllerSecret|wifiPermit|ciphertext/);
  } finally {
    environment.wifiProvRekeyPilotOperation = originalOperation;
    setServiceRegion(originalRegion); gateway.mockRestore();
  }
});

describe('OEM managed explicit same-root WiFi-only Page', () => {
  it('passes the death barrier, checks original CAS/Admin, uses two managed owners and never touches old UNKNOWN or Key', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect();
    const death = deferred<void>(); vi.mocked(WiFiProv.clearState).mockReturnValueOnce(death.promise);
    const { work } = await f.begin();
    expect(f.state()).toBe('closing'); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled();
    death.resolve(); await turn(); expect(f.state()).toBe('await-cloud');
    f.page.continueHandoff(); await turn(); expect(f.state()).toBe('await-local');
    expect(f.management.resolveDeviceInstanceV2).toHaveBeenCalledOnce();
    expect(f.management.resolveDeviceInstanceV2).toHaveBeenCalledWith(instance, 'cloud');
    expect(f.management.getDirectAdminV2).toHaveBeenCalledExactlyOnceWith(context.logicalDeviceId);
    expect(WiFiProv.provision).not.toHaveBeenCalled();
    f.page.continueHandoff(); await work;
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2);
    for (const [options] of vi.mocked(WiFiProv.createDevice).mock.calls) {
      expect(options).toMatchObject({ transport: 'softap', pop: 'explicit fixture PoP', security: 1 });
      expect(options).not.toHaveProperty('softApPurpose'); expect(options).not.toHaveProperty('softApConnectionMode');
    }
    expect(WiFiProv.sendCustomData).toHaveBeenCalledTimes(2);
    expect(WiFiProv.provision).toHaveBeenCalledExactlyOnceWith({ ssid: 'fixture-target', password: 'fixture-password' });
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith(`/device/${context.logicalDeviceId}`);
    expect(f.page.provisioningPoP).toBe(''); noIdentityWrites(f, true);
  });

  it('rejects changed Cloud CAS before a new owner or WiFi', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect();
    f.management.resolveDeviceInstanceV2.mockResolvedValueOnce({ data: { device: { ...context, credentialVersion: 3 } } } as any);
    const { work } = await f.begin(); f.page.continueHandoff(); await work;
    expect(f.management.getDirectAdminV2).not.toHaveBeenCalled(); expect(WiFiProv.createDevice).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); noIdentityWrites(f, true);
  });

  it.each(['instance', 'epoch', 'flags'] as const)('rejects changed %s on the new managed owner', async field => {
    const f = await setup(true, 'sdk-managed'); await f.connect(); const local = await f.toLocal();
    f.model[field] = 2; await local.resume(); await local.work;
    expect(WiFiProv.provision).not.toHaveBeenCalled(); expect(f.page.completion).toBeUndefined(); noIdentityWrites(f, true);
  });

  it('rejects a missing active Admin and never reveals Key or enters the new owner', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect(); f.credentials.load.mockResolvedValueOnce(undefined as any);
    const { work } = await f.begin(); f.page.continueHandoff(); await work;
    expect(f.management.getDirectAdminV2).not.toHaveBeenCalled(); expect(WiFiProv.createDevice).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); noIdentityWrites(f, true);
  });

  it('retires on real background and cannot send WiFi on foreground return', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect(); const local = await f.toLocal();
    f.visibility.active.next(false); await local.work; f.visibility.active.next(true); await turn();
    f.page.continueHandoff(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled(); noIdentityWrites(f, true);
  });

  it('does not authorize managed network-only reconfiguration without its isolated stages', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect(); (f.page as any).softApStages = undefined;
    const { work } = await f.begin(); await work;
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).not.toHaveBeenCalled(); noIdentityWrites(f, true);
  });

  it('does not reopen or write for an account changed during the explicit Cloud/Local handoff', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect(); const local = await f.toLocal();
    f.data.sessionEpoch++; f.data.authDataChanged.next(); await local.work;
    f.page.continueHandoff(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled(); noIdentityWrites(f, true);
  });

  it('keeps a new uncertain WiFi receipt explicit without consuming old UNKNOWN or retrying', async () => {
    const f = await setup(true, 'sdk-managed'); await f.connect(); const local = await f.toLocal();
    vi.mocked(WiFiProv.provision).mockRejectedValueOnce(Object.assign(Error('unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    f.management.readProvisioningCloudV2.mockResolvedValueOnce({ device: { ...context, state: 'active', cloudEnabled: true },
      observation: { kind: 'unavailable', observedAt: Date.now(), deviceInstanceId: null, issuedAt: null, stateUpdatedAt: null } } as any);
    await local.resume(); await local.work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', outcome: 'unconfirmed' });
    f.visibility.active.next(false); await turn(); f.visibility.active.next(true); await turn(); await f.page.provision();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); noIdentityWrites(f, true);
  });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy(); await turn(); await Promise.allSettled(pending.splice(0));
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('explicit same-root system-connected WiFi-only Page', () => {
  it('offers reconfiguration only for a freshly read owner target, never a first install or read-only upgrade', async () => {
    const f = await setup(); expect(f.page.canUseWifiReconfigure).toBe(true); expect(f.page.canUseFirstInstall).toBe(false);
    await f.page.connectSoftAp('system-connected'); expect(WiFiProv.createDevice).not.toHaveBeenCalled();
    await f.connect();
    expect(WiFiProv.createDevice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      softApPurpose: 'blinker-wifi-reconfigure', pop: 'explicit fixture PoP', security: 1,
    }));
    expect(f.page.wifiReconfigureSoftAp).toBe(true); expect(f.page.readOnlySoftAp).toBe(false);
    expect(f.page.networks[0].ssid).toBe('fixture-target');
    const selectedCount = vi.mocked(WiFiProv.createDevice).mock.calls.length;
    await f.page.connectFirstInstallSoftAp(); expect(WiFiProv.createDevice).toHaveBeenCalledTimes(selectedCount);
    noIdentityWrites(f);
  });

  it('does not create a reconfiguration owner on the new-device route', async () => {
    const f = await setup(false); expect(f.page.canUseWifiReconfigure).toBe(false);
    await f.connect(); expect(WiFiProv.createDevice).not.toHaveBeenCalled();
  });

  it('rechecks capability after draining the previous owner rather than trusting the visible offer', async () => {
    const f = await setup(); vi.mocked(WiFiProv.getCapabilities).mockResolvedValueOnce({ ...capabilities,
      softApSystemConnectedWifiReconfigure: false } as any);
    await f.connect(); expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(f.page.phase).toBe('error'); noIdentityWrites(f);
  });

  it('can begin Local reads after returning from system WLAN without requiring the AP to provide Cloud access', async () => {
    const f = await setup(); expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    f.page.transport = 'ble';
    f.visibility.active.next(false); await turn(); f.visibility.active.next(true); await turn();
    f.management.readDeviceContextV2.mockRejectedValueOnce(Error('No Internet on the device AP'));
    expect(f.page.canOperate).toBe(false); expect(f.page.canBeginWifiReconfigure).toBe(true);
    f.page.setTransport('softap'); expect(f.page.transport).toBe('softap');
    await f.connect();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(f.page.sessionReady).toBe(true);
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    const { work } = await f.begin(); expect(f.state()).toBe('await-cloud');
    expect(f.management.getDirectAdminV2).not.toHaveBeenCalled();
    f.page.cancelHandoff(); await work; noIdentityWrites(f);
  });

  it('does not reuse the prior Local-read context after an account change', async () => {
    const f = await setup(); f.data.sessionEpoch++; f.data.authDataChanged.next(); await turn();
    expect(f.page.canBeginWifiReconfigure).toBe(false); await f.connect();
    expect(WiFiProv.createDevice).not.toHaveBeenCalled(); expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noIdentityWrites(f);
  });

  it('uses two actual owners, checks Cloud/Admin/CAS, sends WiFi once and reuses normal completion', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    expect(f.management.resolveDeviceInstanceV2).toHaveBeenCalledOnce(); expect(f.management.getDirectAdminV2).toHaveBeenCalledOnce();
    expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled();
    await local.resume(); await local.work;
    expect(WiFiProv.createDevice).toHaveBeenCalledTimes(2);
    expect(WiFiProv.provisionBlinkerWifiOnly).toHaveBeenCalledExactlyOnceWith({ ssid: 'fixture-target', password: 'fixture-password',
      deviceInstanceIdHex: '01010101010101010101010101010101', accessEpoch: 1 });
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith(`/device/${context.logicalDeviceId}`);
    expect(f.page.provisioningPoP).toBe(''); noIdentityWrites(f);
  });

  it('does no Cloud lookup before the old owner actually dies, even with a ready snapshot', async () => {
    const f = await setup(); await f.connect(); const death = deferred<void>();
    vi.mocked(WiFiProv.clearState).mockReturnValueOnce(death.promise);
    const { work } = await f.begin();
    expect(f.state()).toBe('closing'); expect(f.management.resolveDeviceInstanceV2).not.toHaveBeenCalled();
    death.resolve(); await turn(); expect(f.state()).toBe('await-cloud');
    f.page.cancelHandoff(); await work; noIdentityWrites(f);
  });

  it('rejects a changed Cloud CAS before reopening or sending WiFi', async () => {
    const f = await setup(); await f.connect();
    f.management.resolveDeviceInstanceV2.mockResolvedValueOnce({ data: { device: { ...context, credentialVersion: 3, name: 'Changed' } } });
    const { work } = await f.begin(); f.page.continueHandoff(); await work;
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noIdentityWrites(f);
  });

  it.each(['instance', 'epoch', 'flags'] as const)('rejects changed %s on the new Local owner without writing', async field => {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    f.model[field] = 2;
    await local.resume(); await local.work;
    expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); expect(f.page.completion).toBeUndefined(); noIdentityWrites(f);
  });

  it('requires an active full Admin instead of treating a public matching instance as authentication', async () => {
    const f = await setup(); await f.connect(); f.credentials.load.mockResolvedValueOnce(undefined as any);
    const { work } = await f.begin(); f.page.continueHandoff(); await work;
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noIdentityWrites(f);
  });

  it('blocks WiFi submission during the real scan and consumes no write opportunity', async () => {
    const f = await setup(); await f.connect(); const scan = deferred<any>();
    vi.mocked(WiFiProv.scanWifiNetworks).mockReturnValueOnce(scan.promise);
    const reading = f.page.scanWifiNetworks(); await turn(); await f.page.provision();
    expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); scan.resolve({ networks: [] }); await reading; noIdentityWrites(f);
  });

  it('preserves the old UNKNOWN while a new uncertain WiFi call stays explicit and never retries', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    vi.mocked(WiFiProv.provisionBlinkerWifiOnly).mockRejectedValueOnce(Object.assign(Error('unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    f.management.readProvisioningCloudV2.mockResolvedValueOnce({ device: { ...context, state: 'active', cloudEnabled: true },
      observation: { kind: 'unavailable', observedAt: Date.now(), deviceInstanceId: null, issuedAt: null, stateUpdatedAt: null } } as any);
    await local.resume(); await local.work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', outcome: 'unconfirmed' });
    f.visibility.active.next(false); await turn(); f.visibility.active.next(true); await turn(); await f.page.provision();
    expect(WiFiProv.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); noIdentityWrites(f);
  });

  it('retires at a real background transition and does not reconnect or write after returning', async () => {
    const f = await setup(); await f.connect(); const local = await f.toLocal();
    f.visibility.active.next(false); await local.work; f.visibility.active.next(true); await turn();
    f.page.continueHandoff(); await turn();
    expect(WiFiProv.createDevice).toHaveBeenCalledOnce(); expect(WiFiProv.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noIdentityWrites(f);
  });
});
