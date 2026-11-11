import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WiFiProv } from 'capacitor-wifiprov';
import { base64UrlEncode } from '../../core/device-v2/ble-direct/wire';
import { createWiFiProvUnknownCheckpoint, WiFiProvUnknownRecovery, WIFI_PROV_UNKNOWN_TTL_MS }
  from '../../core/device-v2/provisioning/wifiprov-unknown-checkpoint';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  getCapabilities: vi.fn(), addListener: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(),
  getProvisioningNetworkState: vi.fn(), getInternetState: vi.fn(), requestPermissions: vi.fn(),
  createDevice: vi.fn(), connect: vi.fn(), scanWifiNetworks: vi.fn(), getDeviceInfo: vi.fn(),
  readBlinkerConfigInfo: vi.fn(), bootstrapBlinkerAccess: vi.fn(), provisionBlinkerWifi: vi.fn(),
  provision: vi.fn(), sendCustomData: vi.fn(), resetWifi: vi.fn(),
} }));

const now = 1793352000000, owner = 'checkpoint-owner';
const identity = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: base64UrlEncode(new Uint8Array(16).fill(2)) };
const pages: Esp32ProvisionPage[] = [];
const turn = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function entry(attemptedAt = now - 1000): WiFiProvUnknownRecovery {
  return { requestId: 'wifiprov-' + '1'.repeat(32), name: 'Existing device', context: { ...identity },
    deviceInstanceId: new Uint8Array(16).fill(1), checkpoint: createWiFiProvUnknownCheckpoint(attemptedAt), availability: 'available' };
}
function setup(options: { auth?: { uuid: string } | null; epoch?: number; candidate?: WiFiProvUnknownRecovery } = {}) {
  const candidate = options.candidate ?? entry();
  const visibility = { active: new BehaviorSubject(true), transitions: new Subject<any>() };
  const data = { auth: options.auth === undefined ? { uuid: owner } : options.auth,
    sessionEpoch: options.epoch ?? 7, authDataChanged: new Subject<void>(), getDevice: vi.fn() };
  const record = { requestId: candidate.requestId, name: candidate.name, context: candidate.context, wifiUnknown: candidate.checkpoint };
  const store = { listUnknown: vi.fn(async () => [candidate]), load: vi.fn(async () => record),
    clearUnknown: vi.fn(async () => undefined), saveUnknown: vi.fn(), complete: vi.fn(), prepare: vi.fn(), prepareNew: vi.fn(), bind: vi.fn() };
  const management = { readProvisioningCloudV2: vi.fn(async () => ({ device: { ...identity, state: 'active', cloudEnabled: true },
    observation: { kind: 'online', observedAt: now, issuedAt: now - 500, stateUpdatedAt: now - 250,
      deviceInstanceId: base64UrlEncode(candidate.deviceInstanceId) } })),
    createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), rotateDeviceKeyV2: vi.fn(), enableDeviceCloudV2: vi.fn(),
    registerDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn(), deleteDeviceV2: vi.fn(), readDeviceContextV2: vi.fn() };
  const credentials = { load: vi.fn(), findForProvisioning: vi.fn(), save: vi.fn(), remove: vi.fn() };
  const user = { getAllInfo: vi.fn() }, nav = { navigateRoot: vi.fn() }, direct = { startDirectHandoff: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (work: () => void) => work() } as any,
    { detectChanges: vi.fn() } as any, {} as any, management as any, user as any, data as any, direct as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, nav as any, {} as any, visibility as any);
  Object.defineProperty(page, 'nativeSupported', { value: true });
  (page as any).allocationStore = store; (page as any).controllerCredentials = credentials;
  pages.push(page);
  const noWrites = () => {
    for (const method of ['createDevice', 'connect', 'scanWifiNetworks', 'readBlinkerConfigInfo', 'bootstrapBlinkerAccess',
      'provisionBlinkerWifi', 'provision', 'sendCustomData', 'resetWifi'] as const) expect(WiFiProv[method]).not.toHaveBeenCalled();
    for (const method of ['createDeviceKeyV2', 'revealDeviceKeyV2', 'rotateDeviceKeyV2', 'enableDeviceCloudV2',
      'registerDirectAdminV2', 'resetDirectAdminV2', 'deleteDeviceV2', 'readDeviceContextV2'] as const) expect(management[method]).not.toHaveBeenCalled();
    for (const method of ['saveUnknown', 'complete', 'prepare', 'prepareNew', 'bind'] as const) expect(store[method]).not.toHaveBeenCalled();
    expect(credentials.save).not.toHaveBeenCalled(); expect(credentials.remove).not.toHaveBeenCalled();
    expect(user.getAllInfo).not.toHaveBeenCalled(); expect(direct.startDirectHandoff).not.toHaveBeenCalled();
  };
  return { page, candidate, data, visibility, record, store, management, credentials, nav, noWrites };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.getCapabilities).mockResolvedValue({ platform: 'android', softApProvisioning: true } as any);
  vi.mocked(WiFiProv.addListener).mockResolvedValue({ remove: vi.fn(async () => undefined) });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined); vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.getProvisioningNetworkState).mockResolvedValue({ softApAttempted: false });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('AR-4t persistent UNKNOWN explicit read-only recovery Page', () => {
  it('cold entry lists current-account hints locally without Cloud or a provisioning connection', async () => {
    const f = setup(); await f.page.ngOnInit();
    expect(f.store.listUnknown).toHaveBeenCalledOnce(); expect(f.page.unknownRecoveries).toEqual([f.candidate]);
    expect(f.page.activeUnknownRecovery).toBeUndefined(); expect(f.page.wifiReceiptUnknown).toBe(false);
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.store.load).not.toHaveBeenCalled(); f.noWrites();
  });

  it('waits for initial account restoration and binds an explicit read to the fresh epoch', async () => {
    const f = setup({ auth: null, epoch: 0 }), init = f.page.ngOnInit(); await turn();
    expect(f.store.listUnknown).not.toHaveBeenCalled();
    f.data.auth = { uuid: owner }; f.data.sessionEpoch = 1; f.data.authDataChanged.next(); await init;
    expect(f.store.listUnknown).toHaveBeenCalledOnce(); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    await f.page.recoverUnknownWiFi(f.candidate);
    expect((f.page as any).unknownWiFi.account.sessionEpoch).toBe(1);
    expect(f.page.wifiCloudState).toBe('online'); f.noWrites();
  });

  it('performs one original read only after selecting the exact saved hint and preserves UNKNOWN', async () => {
    const f = setup(); await f.page.ngOnInit(); await f.page.recoverUnknownWiFi(f.candidate);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledExactlyOnceWith(f.candidate.deviceInstanceId, identity, expect.any(AbortSignal));
    expect(f.store.load).toHaveBeenCalledTimes(2); expect(f.page.wifiCloudState).toBe('online');
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.result).toBeUndefined();
    expect(f.page.activeUnknownRecovery).toBe(f.candidate); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.record.wifiUnknown).toEqual(f.candidate.checkpoint); f.noWrites();
  });

  it.each(['expired', 'future'] as const)('keeps %s metadata visible but refuses Cloud and native reconnection', async reason => {
    const candidate = entry(reason === 'expired' ? now - WIFI_PROV_UNKNOWN_TTL_MS : now + 1);
    const f = setup({ candidate }); await f.page.ngOnInit();
    expect(f.page.unknownRecoveries).toEqual([candidate]); expect(f.page.canRecoverUnknown(candidate)).toBe(false);
    await f.page.recoverUnknownWiFi(candidate); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    expect(f.store.load).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled(); f.noWrites();
  });

  it('does not reload or read on background, foreground or cached-page return', async () => {
    const f = setup(); await f.page.ngOnInit(); f.visibility.active.next(false); await turn();
    f.visibility.active.next(true); f.page.ionViewWillLeave(); await f.page.ionViewWillEnter(); await turn();
    expect(f.store.listUnknown).toHaveBeenCalledOnce(); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    expect(f.page.unknownRecoveries).toEqual([f.candidate]); f.noWrites();
  });

  it('clears old-account UI hints and cancels a late HTTP result without erasing durable records', async () => {
    const f = setup(); await f.page.ngOnInit(); const late = deferred<any>();
    f.management.readProvisioningCloudV2.mockReturnValueOnce(late.promise);
    const read = f.page.recoverUnknownWiFi(f.candidate); await turn(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    f.data.auth = { uuid: 'other-owner' }; f.data.sessionEpoch++; f.data.authDataChanged.next(); await read;
    late.resolve({}); await turn();
    expect(f.page.unknownRecoveries).toEqual([]); expect(f.page.wifiReceiptUnknown).toBe(false);
    expect(f.page.wifiCloudState).not.toBe('online'); expect(f.store.clearUnknown).not.toHaveBeenCalled(); f.noWrites();
  });

  it('rejects late local enumeration after account change instead of publishing another owner hints', async () => {
    const f = setup(), late = deferred<WiFiProvUnknownRecovery[]>(); f.store.listUnknown.mockReturnValueOnce(late.promise);
    const init = f.page.ngOnInit(); await turn(); expect(f.store.listUnknown).toHaveBeenCalledOnce();
    f.data.auth = { uuid: 'other-owner' }; f.data.sessionEpoch++; f.data.authDataChanged.next(); await init;
    late.resolve([f.candidate]); await turn();
    expect(f.page.unknownRecoveries).toEqual([]); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); f.noWrites();
  });

  it.each([404, 409])('blocks further reading on authoritative HTTP %s but retains metadata and original intent', async status => {
    const f = setup(); await f.page.ngOnInit(); f.management.readProvisioningCloudV2.mockRejectedValueOnce({ status });
    await f.page.recoverUnknownWiFi(f.candidate); expect(f.page.wifiReceiptUnknown).toBe(true);
    expect(f.page.canCheckWiFiCloud).toBe(false);
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', cloud: 'blocked' });
    await f.page.checkUnknownWiFiCloud(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.page.unknownRecoveries).toEqual([f.candidate]); expect(f.store.clearUnknown).not.toHaveBeenCalled(); f.noWrites();
  });

  it.each([401, 503])('retains HTTP %s metadata for a later explicit read without automatic retry', async status => {
    const f = setup(); await f.page.ngOnInit(); f.management.readProvisioningCloudV2.mockRejectedValueOnce({ status });
    await f.page.recoverUnknownWiFi(f.candidate); await turn();
    expect(f.page.wifiCloudState).toBe('error'); expect(f.page.canCheckWiFiCloud).toBe(true);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(f.page.unknownRecoveries).toEqual([f.candidate]);
    expect(f.record.wifiUnknown).toBe(f.candidate.checkpoint); expect(f.store.clearUnknown).not.toHaveBeenCalled(); f.noWrites();
  });

  it('dismisses only the exact UNKNOWN hint without allocation completion, credential deletion or Cloud', async () => {
    const f = setup(); await f.page.ngOnInit(); await f.page.dismissUnknownRecovery(f.candidate);
    expect(f.store.clearUnknown).toHaveBeenCalledExactlyOnceWith(f.candidate); expect(f.page.unknownRecoveries).toEqual([]);
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.record.context).toEqual(identity); f.noWrites();
  });

  it('requires explicit local reload after storage failure and never queries if the saved record read then fails', async () => {
    const f = setup(); f.store.listUnknown.mockRejectedValueOnce(Error('storage unavailable')); await f.page.ngOnInit();
    expect(f.page.unknownRecoveryError).toContain('暂无法读取'); expect(f.store.listUnknown).toHaveBeenCalledOnce();
    await turn(); expect(f.store.listUnknown).toHaveBeenCalledOnce();
    await f.page.reloadUnknownRecoveries(); expect(f.store.listUnknown).toHaveBeenCalledTimes(2);
    f.store.load.mockRejectedValueOnce(Error('read failed')); await f.page.recoverUnknownWiFi(f.candidate);
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.page.wifiReceiptUnknown).toBe(true); f.noWrites();
  });

  it('retains an exact hint when clearing storage fails and does not retry or erase the underlying allocation', async () => {
    const f = setup(); await f.page.ngOnInit(); f.store.clearUnknown.mockRejectedValueOnce(Error('clear failed'));
    await f.page.dismissUnknownRecovery(f.candidate); await turn();
    expect(f.store.clearUnknown).toHaveBeenCalledOnce(); expect(f.page.unknownRecoveries).toEqual([f.candidate]);
    expect(f.page.unknownRecoveryError).toContain('清理未确认'); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); f.noWrites();
  });

  it('AR-4t bounded/current: ends a stalled local listing at its whole deadline without publishing a late list', async () => {
    const f = setup(), late = deferred<WiFiProvUnknownRecovery[]>(); f.store.listUnknown.mockReturnValueOnce(late.promise);
    const init = f.page.ngOnInit(); await turn();
    expect(f.store.listUnknown).toHaveBeenCalledOnce(); expect(f.page.unknownRecoveryLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(15000); await init;
    expect(f.page.unknownRecoveryLoading).toBe(false); expect(f.page.unknownRecoveryError).toContain('暂无法读取');
    expect(f.page.operationBusy).toBe(false); expect(f.page.unknownRecoveries).toEqual([]);
    late.resolve([f.candidate]); await turn();
    expect(f.page.unknownRecoveries).toEqual([]); expect(f.store.listUnknown).toHaveBeenCalledOnce();
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); f.noWrites();
  });

  it('AR-4t bounded/current: refuses a late HTTP result when the checkpoint disappeared during the request', async () => {
    const f = setup(); await f.page.ngOnInit(); const late = deferred<any>();
    f.management.readProvisioningCloudV2.mockReturnValueOnce(late.promise);
    const read = f.page.recoverUnknownWiFi(f.candidate); await turn();
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(f.store.load).toHaveBeenCalledOnce();
    f.store.load.mockResolvedValueOnce(undefined as any);
    late.resolve({ device: { ...identity, state: 'active', cloudEnabled: true }, observation: {
      kind: 'online', observedAt: now, issuedAt: now - 500, stateUpdatedAt: now - 250,
      deviceInstanceId: base64UrlEncode(f.candidate.deviceInstanceId),
    } });
    await read;
    expect(f.store.load).toHaveBeenCalledTimes(2); expect(f.page.wifiCloudState).toBe('error');
    expect(f.page.canCheckWiFiCloud).toBe(false); expect(f.page.result).toBeUndefined();
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.unknownRecoveries).toEqual([f.candidate]);
    expect(f.store.clearUnknown).not.toHaveBeenCalled(); expect(f.record.wifiUnknown).toBe(f.candidate.checkpoint);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); f.noWrites();
  });
});
