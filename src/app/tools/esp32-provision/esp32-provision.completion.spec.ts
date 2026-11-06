import '@angular/compiler';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WiFiProv } from 'capacitor-wifiprov';
import { environment } from '../../../environments/environment';
import * as serviceRegion from '../../configs/service-region.config';
import { base64UrlEncode } from '../../core/device-v2/ble-direct/wire';
import { wiFiProvCloudBoundary } from '../../core/device-v2/provisioning/wifiprov-cloud-boundary';
import { WiFiProvAdmin } from '../../core/device-v2/provisioning/wifiprov-admin';
import { HttpWiFiProvRekeyGateway } from '../../core/device-v2/provisioning/wifiprov-rekey-gateway';
import { createWiFiProvRekeyCheckpoint, type WiFiProvRekeyCheckpoint } from '../../core/device-v2/provisioning/wifiprov-rekey-checkpoint';
import { CapacitorWiFiProvRekeyJournal } from '../../core/device-v2/provisioning/wifiprov-rekey-journal';
import { Esp32ProvisionPage } from './esp32-provision.page';

vi.mock('capacitor-wifiprov', () => ({ WiFiProv: {
  getCapabilities: vi.fn(), addListener: vi.fn(), stopBleScan: vi.fn(), clearState: vi.fn(),
  getProvisioningNetworkState: vi.fn(), getInternetState: vi.fn(), provision: vi.fn(),
  sendCustomData: vi.fn(), resetWifi: vi.fn(), bootstrapBlinkerAccess: vi.fn(), provisionBlinkerWifi: vi.fn(),
} }));

const now = 1793352000000;
const identity = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: base64UrlEncode(new Uint8Array(16).fill(2)) };
const instance = new Uint8Array(16).fill(1), pages: Esp32ProvisionPage[] = [];
const pending: Promise<unknown>[] = [];
const turn = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function tracked<T>(work: Promise<T>): Promise<T> { pending.push(work.catch(() => undefined)); return work; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
const response = (kind: 'online' | 'unconfirmed' | 'unavailable' = 'online') => ({
  device: { ...identity, state: 'active', cloudEnabled: true },
  observation: { kind, observedAt: now + 1000, deviceInstanceId: kind === 'online' ? base64UrlEncode(instance) : null,
    issuedAt: kind === 'online' ? now + 100 : null, stateUpdatedAt: kind === 'online' ? now + 500 : null },
});

describe('terminal onboarding recovery exit', () => {
  it('leaves an explicit WiFi rejection without restarting identity, Cloud reads or configuration', async () => {
    const f = setup(); vi.mocked(WiFiProv.provision).mockResolvedValueOnce({ success: false });
    await f.page.provision(); const result = f.page.completion;
    expect(result).toMatchObject({ officialReceipt: 'rejected', outcome: 'failed' });
    await f.page.returnToDeviceList(); await f.page.startOver(); await f.page.provision();
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/home/device');
    expect(f.page.completion).toBe(result); expect(f.page.canOperate).toBe(false);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled();
  });

  it('does not use leaving the result to clear an uncertain native close or enable a new owner', async () => {
    const f = setup(); vi.mocked(WiFiProv.provision).mockResolvedValueOnce({ success: false });
    vi.mocked(WiFiProv.clearState).mockRejectedValueOnce(Error('close unconfirmed'));
    await f.page.provision(); await turn();
    expect((f.page as any).closeFailed).toBe(true);
    await f.page.returnToDeviceList();
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/home/device');
    expect((f.page as any).closeFailed).toBe(true); expect(f.page.canOperate).toBe(false);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled();
  });

  it.each(['false', 'rejected'] as const)('preserves the result on a %s return and allows only another explicit navigation', async kind => {
    const f = setup(); vi.mocked(WiFiProv.provision).mockResolvedValueOnce({ success: false });
    await f.page.provision(); const result = f.page.completion;
    if (kind === 'false') f.nav.navigateRoot.mockResolvedValueOnce(false);
    else f.nav.navigateRoot.mockRejectedValueOnce(Error('route unavailable'));
    await f.page.returnToDeviceList(); await vi.advanceTimersByTimeAsync(40000);
    expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(f.page.completion).toBe(result);
    expect(f.page.completionActionMessage).toContain('暂无法返回');
    await f.page.returnToDeviceList(); expect(f.nav.navigateRoot).toHaveBeenCalledTimes(2);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('bounds repeated clicks to one navigation and suppresses its late error after leaving', async () => {
    const f = setup(), route = deferred<boolean>();
    vi.mocked(WiFiProv.provision).mockResolvedValueOnce({ success: false });
    await f.page.provision(); f.nav.navigateRoot.mockReturnValueOnce(route.promise);
    const leave = tracked(f.page.returnToDeviceList()); await turn();
    await f.page.returnToDeviceList(); expect(f.nav.navigateRoot).toHaveBeenCalledOnce();
    f.page.ionViewWillLeave(); route.resolve(false); await leave;
    expect(f.page.completionActionMessage).toBe(''); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled();
  });
});

describe('foreground-only one-shot automatic entry', () => {
  it('uses the same entry chain for a confirmed first-install port without falling back to generic WiFi', async () => {
    const f = setup(), typed = { submittedWiFi: true, provision: vi.fn(async () => ({ success: true })), retire: vi.fn() };
    (f.page as any).selectedSoftApMode = 'system-connected'; (f.page as any).firstInstallRequested = true;
    (f.page as any).firstInstallPort = typed;
    f.page.selectedDevice = { ...f.page.selectedDevice!, transport: 'softap' };
    await f.page.provision();
    expect(typed.provision).toHaveBeenCalledOnce(); expect(WiFiProv.provision).not.toHaveBeenCalled();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce(); expect(f.nav.navigateRoot).toHaveBeenCalledOnce();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled();
  });

  it.each(['false', 'rejected'] as const)('does not automatically retry a %s route, withdraw confirmation or reopen WiFi', async result => {
    const f = setup();
    if (result === 'false') f.nav.navigateRoot.mockResolvedValueOnce(false);
    else f.nav.navigateRoot.mockRejectedValueOnce(Error('route unavailable'));
    await f.page.provision(); await vi.advanceTimersByTimeAsync(40000);
    await f.page.checkCompletionCloud(); await f.page.ionViewWillEnter();
    expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'online', outcome: 'ready' });
    expect(f.page.completionActionMessage).toContain('暂无法打开'); expect(f.page.wifiReceiptUnknown).toBe(false);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.saveUnknown).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled();
    await f.page.openCompletionDevice(); // Only a fresh explicit user action may try navigation again.
    expect(f.nav.navigateRoot).toHaveBeenCalledTimes(2); expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('shares the busy gate with a manual click while automatic navigation is reading context', async () => {
    const f = setup(), context = deferred<typeof identity>();
    f.management.readDeviceContextV2.mockReturnValueOnce(context.promise);
    const work = tracked(f.page.provision()); await turn();
    try {
      expect(f.page.isProvisioning).toBe(false); expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
      expect(f.page.canOpenCompletion).toBe(false); await f.page.openCompletionDevice();
      expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    } finally { context.resolve({ ...identity }); }
    await work; expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(f.direct.startDirectHandoff).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('does not start a second navigation if a manual click wins at the ready transition', async () => {
    const f = setup(); let manual: Promise<void> | undefined;
    f.cdr.detectChanges.mockImplementation(() => {
      if (!manual && f.page.completion?.outcome === 'ready' && !f.page.isProvisioning) {
        manual = tracked(f.page.openCompletionDevice());
      }
    });
    await f.page.provision(); await manual;
    expect(manual).toBeDefined(); expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('permanently skips the automatic tail if cancelled at ready, even after returning', async () => {
    const f = setup(); let cancelled = false;
    f.cdr.detectChanges.mockImplementation(() => {
      if (!cancelled && f.page.completion?.outcome === 'ready' && !f.page.isProvisioning) {
        cancelled = true; f.page.ionViewWillLeave();
      }
    });
    await f.page.provision(); await f.page.ionViewWillEnter(); await vi.advanceTimersByTimeAsync(40000);
    expect(cancelled).toBe(true); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    await f.page.openCompletionDevice(); expect(f.nav.navigateRoot).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('does not resume automatic entry after a real visibility background transition and a late native success', async () => {
    const f = setup(), native = deferred<{ success: boolean }>();
    // Only skip initial discovery; use the real visibility subscription and write lifetime.
    vi.spyOn(f.page as any, 'preparePage').mockResolvedValue(undefined); await f.page.ngOnInit();
    vi.mocked(WiFiProv.provision).mockReturnValueOnce(native.promise);
    const work = tracked(f.page.provision()); await turn();
    try { expect(WiFiProv.provision).toHaveBeenCalledOnce(); f.visibility.active.next(false); }
    finally { f.visibility.active.next(true); native.resolve({ success: true }); }
    await work; await f.page.ionViewWillEnter(); await vi.advanceTimersByTimeAsync(40000);
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled();
  });

  it.each(['network', 'context', 'list'] as const)('cancels the automatic navigation during %s without late entry on return', async stage => {
    const f = setup(), network = deferred<{ softApAttempted: boolean }>(), context = deferred<typeof identity>(), list = deferred<boolean>();
    if (stage === 'network') vi.mocked(WiFiProv.getProvisioningNetworkState)
      .mockResolvedValueOnce({ softApAttempted: false }).mockReturnValueOnce(network.promise);
    if (stage === 'context') f.management.readDeviceContextV2.mockReturnValueOnce(context.promise);
    if (stage === 'list') f.user.getAllInfo.mockReturnValueOnce(list.promise);
    const work = tracked(f.page.provision()); await turn();
    try {
      const signal = (f.page as any).completionNavigationAbort?.signal as AbortSignal | undefined;
      expect(signal).toBeDefined(); f.page.ionViewWillLeave(); expect(signal?.aborted).toBe(true);
    } finally { network.resolve({ softApAttempted: false }); context.resolve({ ...identity }); list.resolve(true); }
    await work; await f.page.ionViewWillEnter(); await vi.advanceTimersByTimeAsync(40000);
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.direct.startDirectHandoff).not.toHaveBeenCalled();
    expect(f.page.completionActionMessage).toBe(''); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled();
  });

  it.each(['CAS', 'account', 'owner'] as const)('keeps the original %s guard in the automatic entry chain', async guard => {
    const f = setup();
    f.management.readDeviceContextV2.mockImplementationOnce(async () => {
      if (guard === 'account') f.data.auth = { uuid: 'another-owner' };
      if (guard === 'owner') vi.spyOn(wiFiProvCloudBoundary, 'blocked', 'get').mockReturnValue(true);
      return { ...identity, credentialVersion: guard === 'CAS' ? 2 : 1 };
    });
    await f.page.provision(); await vi.advanceTimersByTimeAsync(40000);
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.user.getAllInfo).not.toHaveBeenCalled(); expect(f.direct.startDirectHandoff).not.toHaveBeenCalled();
    expect(f.page.completion?.officialReceipt).toBe('confirmed'); expect(f.page.canOpenCompletion).toBe(false);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.saveUnknown).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('never automatically enters a replacement attempt even if it carries the same public values', async () => {
    const f = setup(); let replaced = false;
    f.cdr.detectChanges.mockImplementation(() => {
      if (!replaced && f.page.completion?.outcome === 'ready' && !f.page.isProvisioning) {
        replaced = true; (f.page as any).completionAttempt = { ...(f.page as any).completionAttempt };
      }
    });
    await f.page.provision(); expect(replaced).toBe(true);
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('leaves a failed automatic network check for explicit navigation without automatically retrying it', async () => {
    const f = setup(); vi.mocked(WiFiProv.getProvisioningNetworkState)
      .mockResolvedValueOnce({ softApAttempted: false }).mockRejectedValueOnce(Error('native check unavailable'));
    await f.page.provision(); const reads = vi.mocked(WiFiProv.getProvisioningNetworkState).mock.calls.length;
    await vi.advanceTimersByTimeAsync(40000);
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(f.page.completionActionMessage).toContain('隔离尚未解除'); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.getProvisioningNetworkState).toHaveBeenCalledTimes(reads);
    await f.page.openCompletionDevice(); expect(f.nav.navigateRoot).toHaveBeenCalledOnce();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });
});

function setup() {
  const visibility = { active: new BehaviorSubject(true), transitions: new Subject<any>() };
  const data = { auth: { uuid: 'completion-owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(),
    getDevice: vi.fn(() => ({ ...identity, config: { isShared: false } })) };
  const management = { readProvisioningCloudV2: vi.fn(async () => response()),
    readDeviceContextV2: vi.fn(async (_id: string, _signal?: AbortSignal) => ({ ...identity })), resolveDeviceInstanceV2: vi.fn(),
    createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn(), rotateDeviceKeyV2: vi.fn(),
    registerDirectAdminV2: vi.fn(), resetDirectAdminV2: vi.fn(), enableDeviceCloudV2: vi.fn() };
  const user = { getAllInfo: vi.fn(async () => true) }, nav = { navigateRoot: vi.fn(async () => true) };
  const direct = { startDirectHandoff: vi.fn(async () => undefined) };
  const cdr = { detectChanges: vi.fn() };
  const page = new Esp32ProvisionPage({ run: (work: () => void) => work() } as any,
    cdr as any, {} as any, management as any, user as any, data as any, direct as any,
    { snapshot: { queryParamMap: { get: () => null } } } as any, nav as any, {} as any, visibility as any);
  pages.push(page); Object.defineProperty(page, 'nativeSupported', { value: true });
  page.selectedDevice = { name: 'BLINKER_FIXTURE', transport: 'ble', security: 1, connected: true } as any;
  page.ssid = 'fixture-target'; page.password = 'fixture-password'; page.blinkerDeviceName = 'Existing fixture';
  const store = { load: vi.fn(), complete: vi.fn(), saveUnknown: vi.fn(), clearUnknown: vi.fn(), listUnknown: vi.fn() };
  (page as any).allocationStore = store;
  // Identity admission is a separately tested boundary. This suite exercises
  // the real Page/native terminal -> original Cloud observer -> result chain.
  (page as any).installBlinkerIdentity = vi.fn(async () => {
    (page as any).confirmedIdentityContext = { ...identity };
    (page as any).allocation = { logicalDeviceId: identity.logicalDeviceId, deviceKey: '',
      deviceInstanceId: instance.slice(), accessEpoch: 1, preserveAccess: true, credentialStored: true,
      networkOnlyReconfiguration: true };
  });
  return { page, visibility, data, management, user, nav, direct, store, cdr };
}

const rekeyOperation = new Uint8Array(16).fill(4);
const rekeyNext = { credentialVersion: 2, locator: base64UrlEncode(new Uint8Array(16).fill(5)) };
const rekeyIdentity = { logicalDeviceId: identity.logicalDeviceId, ...rekeyNext };
const defaultOperation = environment.wifiProvRekeyPilotOperation;
function setupRekey(recovered = false) {
  const f = setup(), page = f.page as any;
  environment.wifiProvRekeyPilotOperation = base64UrlEncode(rekeyOperation);
  vi.spyOn(serviceRegion, 'getServiceRegion').mockReturnValue('Development');
  page.reconfigureTarget = identity.logicalDeviceId; page.reconfigureContext = { ...identity }; page.reconfigureReady = true;
  Object.assign(f.data.auth, { accessToken: 'fixture-access-token' });
  const authority = page.currentAccount().authority;
  const binding = { operationId: environment.wifiProvRekeyPilotOperation, instance: base64UrlEncode(instance),
    challenge: base64UrlEncode(new Uint8Array(16).fill(6)), accessEpoch: 1, fromVersion: 1, oldLocator: identity.locator };
  const scope = { authority, accountId: f.data.auth.uuid, region: 'Development' as const, logicalDeviceId: identity.logicalDeviceId,
    operationId: binding.operationId, deviceInstanceId: binding.instance, accessEpoch: 1, previous: {
      credentialVersion: identity.credentialVersion, locator: identity.locator,
    } };
  const old = createWiFiProvRekeyCheckpoint(scope, now - 1000);
  let checkpoint: WiFiProvRekeyCheckpoint | undefined = recovered
    ? { ...old, phase: 'wifi-accepted', next: rekeyNext, wifiDispatchedAt: now - 100, updatedAt: now - 99 } : undefined;
  vi.spyOn(CapacitorWiFiProvRekeyJournal.prototype, 'load').mockImplementation(async () => checkpoint);
  vi.spyOn(CapacitorWiFiProvRekeyJournal.prototype, 'replace').mockImplementation(async (expected, next) => {
    expect(expected).toEqual(checkpoint); checkpoint = next;
  });
  f.management.resolveDeviceInstanceV2.mockResolvedValue({ data: { device: { ...identity, name: 'Existing fixture' } } });
  vi.spyOn(WiFiProvAdmin.prototype, 'inspectExistingNetwork').mockResolvedValue({ ...identity, accessEpoch: 1 });
  vi.spyOn(page.controllerCredentials, 'load').mockResolvedValue({ source: 'wifiprov', state: 'active', accessEpoch: 1,
    permissions: 0x0f, deviceInstanceId: instance.slice(), controllerId: new Uint8Array(16).fill(7), credentialVersion: 1,
    controllerSecret: new Uint8Array(32).fill(8), cloudContext: { ...scope.previous } });
  vi.spyOn(page.controllerCredentials, 'recordWiFiProvRekey').mockResolvedValue(undefined);
  vi.spyOn(page.provisioningTransport, 'request').mockImplementation(async (_endpoint, payload) => {
    const operation = (payload as Uint8Array)[1];
    if (operation === 1) {
      const result = new Uint8Array(24); result.set([2, 1, 0, 0x0f]); result.set(instance, 4); result[23] = 1; return result;
    }
    const result = new Uint8Array(operation === 4 || operation === 5 ? 51 : 19);
    result.set([2, operation, 0]); result.set(operation === 8 ? new Uint8Array(16).fill(9) : rekeyOperation, 3);
    if (result.length === 51) result.fill(10, 19);
    return result;
  });
  const responseScope = { logicalDeviceId: identity.logicalDeviceId, operationId: binding.operationId, fromVersion: 1, toVersion: 2 };
  vi.spyOn(HttpWiFiProvRekeyGateway.prototype, 'prepare').mockResolvedValue({ ...responseScope, state: 'prepared', binding });
  vi.spyOn(HttpWiFiProvRekeyGateway.prototype, 'issue').mockResolvedValue({ ...responseScope, state: 'key_issued',
    newLocator: rekeyNext.locator, transfer: { iv: new Uint8Array(12).fill(11), box: new Uint8Array(48).fill(12) } });
  vi.spyOn(HttpWiFiProvRekeyGateway.prototype, 'confirm').mockResolvedValue({ ...responseScope, state: 'committed',
    newLocator: rekeyNext.locator, wifiPermit: new Uint8Array(32).fill(13) });
  const cloud = (issuedAt = (checkpoint?.wifiDispatchedAt ?? now) + 100) => ({
    device: { ...rekeyIdentity, state: 'active', cloudEnabled: true },
    observation: { ...response().observation, issuedAt, stateUpdatedAt: issuedAt + 400, observedAt: issuedAt + 900 },
  });
  f.management.readProvisioningCloudV2.mockImplementation(async () => cloud());
  f.management.readDeviceContextV2.mockResolvedValue({ ...rekeyIdentity });
  return { ...f, cloud, checkpoint: () => checkpoint };
}

async function explicitlyReady() {
  const f = setup();
  // Exercise the real explicit-recovery chain, not a private skip-auto flag.
  f.management.readProvisioningCloudV2.mockRejectedValueOnce(Error('fixture initial read unavailable'));
  await f.page.provision(); await f.page.checkCompletionCloud();
  expect(f.page.completion?.outcome).toBe('ready'); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  return f;
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  vi.mocked(WiFiProv.provision).mockResolvedValue({ success: true });
  vi.mocked(WiFiProv.stopBleScan).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.clearState).mockResolvedValue(undefined);
  vi.mocked(WiFiProv.getProvisioningNetworkState).mockResolvedValue({ softApAttempted: false });
});
afterEach(async () => {
  for (const page of pages.splice(0)) page.ngOnDestroy();
  await turn(); await Promise.allSettled(pending.splice(0));
  environment.wifiProvRekeyPilotOperation = defaultOperation;
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('restricted rekey completion only after this Apply', () => {
  it('waits for the exact native Apply result and owner close before observing the matching new version', async () => {
    const f = setupRekey(), apply = deferred<{ success: boolean }>(), close = deferred<void>();
    vi.mocked(WiFiProv.provision).mockReturnValue(apply.promise);
    vi.mocked(WiFiProv.clearState).mockReturnValue(close.promise);
    const work = tracked(f.page.provision());
    try {
      await vi.waitFor(() => expect(WiFiProv.provision).toHaveBeenCalledOnce());
      expect(f.checkpoint()?.phase).toBe('wifi-dispatched');
      expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
      apply.resolve({ success: true });
      await vi.waitFor(() => expect(WiFiProv.clearState).toHaveBeenCalledOnce());
      expect(f.page.completion?.officialReceipt).toBe('confirmed');
      expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    } finally { apply.resolve({ success: true }); close.resolve(); }
    await work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'online', outcome: 'ready' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledExactlyOnceWith(instance, rekeyIdentity, expect.any(AbortSignal));
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.page.canOpenCompletion).toBe(true);
    await f.page.openCompletionDevice(); expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/device/' + identity.logicalDeviceId);
    expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('a same-version State refresh at the dispatch fence cannot finish the result', async () => {
    const f = setupRekey();
    f.management.readProvisioningCloudV2.mockImplementation(async () => f.cloud(f.checkpoint()!.wifiDispatchedAt!));
    const work = tracked(f.page.provision());
    await vi.waitFor(() => expect(f.management.readProvisioningCloudV2).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(31000); await work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'unconfirmed', outcome: 'wifi-connected' });
    expect(f.page.canOpenCompletion).toBe(false); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('preserves the official WiFi result but does not query Cloud if owner release fails', async () => {
    const f = setupRekey(); vi.mocked(WiFiProv.clearState).mockRejectedValue(Error('owner close unconfirmed'));
    await f.page.provision(); await f.page.checkCompletionCloud();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'blocked', outcome: 'wifi-connected' });
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.page.canOpenCompletion).toBe(false);
    expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('does not turn UNKNOWN or a restored accepted checkpoint into fresh Apply evidence', async () => {
    const lost = setupRekey();
    vi.mocked(WiFiProv.provision).mockRejectedValueOnce(Object.assign(Error('fixture-lost'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await lost.page.provision(); await lost.page.checkCompletionCloud();
    expect(lost.checkpoint()?.phase).toBe('wifi-unknown');
    expect(lost.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce();
    const restored = setupRekey(true);
    await restored.page.provision(); await restored.page.checkCompletionCloud();
    expect(restored.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'unconfirmed', outcome: 'wifi-connected' });
    expect(restored.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });
});

describe('one-operation provisioning product completion', () => {
  it('automatically enters once only after official success, real cleanup and fresh Cloud confirmation', async () => {
    const f = setup(), close = deferred<void>(), cloud = deferred<ReturnType<typeof response>>();
    vi.mocked(WiFiProv.clearState).mockReturnValue(close.promise);
    f.management.readProvisioningCloudV2.mockReturnValue(cloud.promise);
    const work = tracked(f.page.provision()); await turn();
    expect(f.page.completion?.officialReceipt).toBe('confirmed'); expect(f.page.completionChecking).toBe(true);
    expect(f.page.progress).toBeLessThan(100); expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
    expect(f.user.getAllInfo).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    close.resolve(); await turn(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    cloud.resolve(response()); await work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready', cloud: 'online' });
    expect(f.page.canOperate).toBe(false); expect(f.page.canProvision).toBe(false);
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/device/' + identity.logicalDeviceId);
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    expect(f.management.readDeviceContextV2.mock.calls[0][1]?.aborted).toBe(false);
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(WiFiProv.sendCustomData).not.toHaveBeenCalled();
  });

  it('shows WiFi-connected rather than failed at the bounded Cloud deadline and never resends', async () => {
    const f = setup(); f.management.readProvisioningCloudV2.mockResolvedValue(response('unconfirmed'));
    const work = tracked(f.page.provision()); await turn(); await vi.advanceTimersByTimeAsync(30001); await work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'wifi-connected', reason: 'timeout' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(5);
    expect(f.page.canCheckCompletion).toBe(true); expect(f.page.canOpenCompletion).toBe(false);
    await f.page.startOver(); await f.page.provision();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  });

  it('ends a network read error without an automatic read retry or falsely rejecting WiFi', async () => {
    const f = setup(); f.management.readProvisioningCloudV2.mockRejectedValue(Error('offline'));
    await f.page.provision(); await vi.advanceTimersByTimeAsync(40000);
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'wifi-connected', cloud: 'unavailable' });
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    f.management.readProvisioningCloudV2.mockResolvedValue(response()); await f.page.checkCompletionCloud();
    expect(f.page.completion?.outcome).toBe('ready'); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  });

  it('can confirm generic BLE UNKNOWN through Cloud without fabricating or consuming a durable allocation', async () => {
    const f = setup(); vi.mocked(WiFiProv.provision).mockRejectedValue(Object.assign(Error('lost receipt'), { code: 'PROVISIONING_RESULT_UNKNOWN' }));
    await f.page.provision();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', cloud: 'online', outcome: 'ready' });
    expect(f.page.wifiReceiptUnknown).toBe(true); expect(f.page.wifiCloudState).toBe('online');
    expect(f.store.saveUnknown).not.toHaveBeenCalled(); expect(f.store.load).not.toHaveBeenCalled();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    await f.page.openCompletionDevice();
    expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(f.direct.startDirectHandoff).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it.each(['AUTH_FAILED', 'NETWORK_NOT_FOUND'] as const)('uses only exact official %s as device rejection, with no Cloud probe', async reason => {
    const f = setup(); vi.mocked(WiFiProv.provision).mockRejectedValue(Error('Provisioning failed on the device: ' + reason));
    await f.page.provision();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'rejected', outcome: 'failed' });
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.page.canCheckCompletion).toBe(false);
    expect(f.page.completionFailureMessage).toContain(reason === 'AUTH_FAILED' ? '认证失败' : '未找到');
  });

  it.each(['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND'] as const)(
    'accepts the matched native %s code even through a generic IPC message, without Cloud or replay', async code => {
      const f = setup(); vi.mocked(WiFiProv.provision).mockRejectedValue(Object.assign(
        Error('The isolated local operation did not complete; no request is retried.'), { code }));
      await f.page.provision();
      expect(f.page.completion).toMatchObject({ officialReceipt: 'rejected', outcome: 'failed' });
      expect(f.page.completionFailureMessage).toContain(code === 'WIFIPROV_WIFI_AUTH_FAILED' ? '认证失败' : '未找到');
      expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.page.canCheckCompletion).toBe(false);
      expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.store.saveUnknown).not.toHaveBeenCalled();
      expect(f.store.complete).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(40000); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    });

  it.each(['AUTH_FAILED', 'NETWORK_NOT_FOUND'] as const)(
    'keeps the old BLE rejection code compatible with exact %s wording', async reason => {
      const f = setup(); vi.mocked(WiFiProv.provision).mockRejectedValue(Object.assign(
        Error('Provisioning failed on the device: ' + reason), { code: 'WIFIPROV_DEVICE_REJECTED' }));
      await f.page.provision(); expect(f.page.completion).toMatchObject({ officialReceipt: 'rejected', outcome: 'failed' });
      expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    });

  it.each(['PROVISIONING_RESULT_UNKNOWN', 'WIFIPROV_RPC_TIMEOUT', 'WIFIPROV_PROVISION_FAILED'])(
    'never lets %s become definite WiFi failure through legacy-looking message text', async code => {
      const f = setup(); f.management.readProvisioningCloudV2.mockResolvedValue(response('unavailable'));
      vi.mocked(WiFiProv.provision).mockRejectedValue(Object.assign(
        Error('Provisioning failed on the device: AUTH_FAILED'), { code }));
      await f.page.provision(); expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', outcome: 'unconfirmed' });
      expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
      expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    });

  it('does not turn a DEVICE_DISCONNECTED reason into definite WiFi failure', async () => {
    const f = setup(); vi.mocked(WiFiProv.provision).mockRejectedValue(Error('Provisioning failed on the device: DEVICE_DISCONNECTED'));
    await f.page.provision(); expect(f.page.completion).toMatchObject({ officialReceipt: 'unknown', outcome: 'ready' });
  });

  it('does not create UNKNOWN or start Cloud when the typed port rejects before WiFi submission', async () => {
    const f = setup(), typed = { submittedWiFi: false, provision: vi.fn(async () => { throw Error('WIFIPROV_OPERATION_CANCELLED'); }), retire: vi.fn() };
    (f.page as any).selectedSoftApMode = 'system-connected'; (f.page as any).firstInstallRequested = true;
    (f.page as any).firstInstallPort = typed;
    f.page.selectedDevice = { ...f.page.selectedDevice!, transport: 'softap' };
    await f.page.provision(); await turn();
    expect(typed.provision).toHaveBeenCalledOnce(); expect(f.page.wifiReceiptUnknown).toBe(false);
    expect(f.page.completion).toBeUndefined(); expect(f.store.saveUnknown).not.toHaveBeenCalled();
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(WiFiProv.provision).not.toHaveBeenCalled();
  });

  it('keeps a confirmed receipt when local cleanup fails, without crossing the owner fence', async () => {
    const f = setup(); vi.mocked(WiFiProv.clearState).mockRejectedValue(Error('close unconfirmed'));
    await f.page.provision();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'blocked', outcome: 'wifi-connected' });
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled(); expect(f.page.completionChecking).toBe(false);
    expect(f.page.canCheckCompletion).toBe(false); expect(f.page.wifiReceiptUnknown).toBe(false);
  });

  it('cancels observation on leave, ignores late Cloud success, and does not read on foreground return', async () => {
    const f = setup(), cloud = deferred<ReturnType<typeof response>>();
    f.management.readProvisioningCloudV2.mockReturnValue(cloud.promise);
    const work = tracked(f.page.provision()); await turn(); expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    f.page.ionViewWillLeave(); await work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'unconfirmed', reason: 'cancelled' });
    cloud.resolve(response()); await turn(); await f.page.ionViewWillEnter(); await vi.advanceTimersByTimeAsync(40000);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce(); expect(f.page.completion?.outcome).toBe('wifi-connected');
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  });

  it('uses a fresh navigation signal after cancelled completion, explicit Cloud recovery and return', async () => {
    const f = setup(), cloud = deferred<ReturnType<typeof response>>();
    f.management.readProvisioningCloudV2.mockReturnValueOnce(cloud.promise);
    const work = tracked(f.page.provision()); await turn();
    const attempt = (f.page as any).completionAttempt;
    const retiredSignal = (f.page as any).cloudNetworkAbort.signal as AbortSignal;
    f.page.ionViewWillLeave(); await work;
    expect(retiredSignal.aborted).toBe(true);
    cloud.resolve(response()); await turn(); await f.page.ionViewWillEnter();
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', reason: 'cancelled' });
    await f.page.checkCompletionCloud();
    expect(f.page.completion?.outcome).toBe('ready'); expect((f.page as any).completionAttempt).toBe(attempt);
    expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    const networkReads = vi.mocked(WiFiProv.getProvisioningNetworkState).mock.calls.length;
    await f.page.openCompletionDevice();
    expect(WiFiProv.getProvisioningNetworkState).toHaveBeenCalledTimes(networkReads + 1);
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    const signal = f.management.readDeviceContextV2.mock.calls[0][1] as AbortSignal;
    expect(signal).toBeDefined(); expect(signal).not.toBe(retiredSignal); expect(signal.aborted).toBe(false);
    expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/device/' + identity.logicalDeviceId);
    expect(f.page.completionActionMessage).toBe(''); expect((f.page as any).completionOpening).toBe(false);
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.store.saveUnknown).not.toHaveBeenCalled(); expect(f.store.clearUnknown).not.toHaveBeenCalled();
  });

  it.each(['network', 'context', 'list'] as const)('does not publish late navigation after leaving during %s', async stage => {
    const f = await explicitlyReady();
    const network = deferred<{ softApAttempted: boolean }>(), context = deferred<typeof identity>(), list = deferred<boolean>();
    if (stage === 'network') vi.mocked(WiFiProv.getProvisioningNetworkState).mockReturnValueOnce(network.promise);
    if (stage === 'context') f.management.readDeviceContextV2.mockReturnValueOnce(context.promise);
    if (stage === 'list') f.user.getAllInfo.mockReturnValueOnce(list.promise);
    const open = tracked(f.page.openCompletionDevice()); await turn();
    const signal = (f.page as any).completionNavigationAbort.signal as AbortSignal;
    f.page.ionViewWillLeave(); expect(signal.aborted).toBe(true);
    network.resolve({ softApAttempted: false }); context.resolve({ ...identity }); list.resolve(true); await open;
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.direct.startDirectHandoff).not.toHaveBeenCalled();
    expect(f.page.completionActionMessage).toBe(''); expect((f.page as any).completionOpening).toBe(false);
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('shows cleanup failure in the result without withdrawing confirmed availability or crossing its fence', async () => {
    const f = await explicitlyReady();
    vi.spyOn(f.page as any, 'releasePlugin').mockRejectedValueOnce(Error('unconfirmed close'));
    await f.page.openCompletionDevice();
    expect(f.page.completionActionMessage).toContain('退出尚未确认');
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(f.page.canOpenCompletion).toBe(false);
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('shows a native network-read failure in the result, with no automatic navigation or write retry', async () => {
    const f = await explicitlyReady();
    const reads = vi.mocked(WiFiProv.getProvisioningNetworkState).mock.calls.length;
    vi.mocked(WiFiProv.getProvisioningNetworkState).mockRejectedValueOnce(Error('network state unavailable'));
    await f.page.openCompletionDevice(); await vi.advanceTimersByTimeAsync(10000);
    expect(f.page.completionActionMessage).toContain('隔离尚未解除');
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(WiFiProv.getProvisioningNetworkState).toHaveBeenCalledTimes(reads + 1);
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('does not use a successful native snapshot to bypass a Local owner acquired during navigation', async () => {
    const f = await explicitlyReady();
    const network = deferred<{ softApAttempted: boolean }>();
    vi.mocked(WiFiProv.getProvisioningNetworkState).mockReturnValueOnce(network.promise);
    const open = tracked(f.page.openCompletionDevice()); await turn();
    vi.spyOn(wiFiProvCloudBoundary, 'blocked', 'get').mockReturnValue(true);
    network.resolve({ softApAttempted: false }); await open;
    expect(f.page.completionActionMessage).toContain('隔离尚未解除');
    expect(f.page.canOpenCompletion).toBe(false); expect(f.page.completion?.outcome).toBe('ready');
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it.each(['context', 'list'] as const)('rechecks the live owner fence after waiting for %s', async stage => {
    const f = await explicitlyReady();
    const context = deferred<typeof identity>(), list = deferred<boolean>();
    if (stage === 'context') f.management.readDeviceContextV2.mockReturnValueOnce(context.promise);
    else f.user.getAllInfo.mockReturnValueOnce(list.promise);
    const open = tracked(f.page.openCompletionDevice()); await turn();
    vi.spyOn(wiFiProvCloudBoundary, 'blocked', 'get').mockReturnValue(true);
    context.resolve({ ...identity }); list.resolve(true); await open;
    expect(f.page.completionActionMessage).toContain('隔离尚未解除');
    expect(f.page.canOpenCompletion).toBe(false); expect(f.page.completion?.outcome).toBe('ready');
    if (stage === 'context') expect(f.user.getAllInfo).not.toHaveBeenCalled();
    expect(f.direct.startDirectHandoff).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it.each([true, false])('keeps list-refresh failure separate from ready with cached device=%s', async cached => {
    const f = await explicitlyReady();
    f.user.getAllInfo.mockRejectedValueOnce(Error('list offline'));
    if (!cached) f.data.getDevice.mockReturnValue(undefined as any);
    await f.page.openCompletionDevice();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(f.nav.navigateRoot).toHaveBeenCalledTimes(cached ? 1 : 0);
    if (!cached) expect(f.page.completionActionMessage).toContain('列表暂未刷新');
    expect(WiFiProv.provision).toHaveBeenCalledOnce(); expect(f.store.complete).not.toHaveBeenCalled();
  });

  it.each(['false', 'rejected'] as const)('shows a %s route outcome without withdrawing ready or retrying', async result => {
    const f = await explicitlyReady();
    if (result === 'false') f.nav.navigateRoot.mockResolvedValueOnce(false);
    else f.nav.navigateRoot.mockRejectedValueOnce(Error('route rejected'));
    await f.page.openCompletionDevice(); await vi.advanceTimersByTimeAsync(10000);
    expect(f.page.completionActionMessage).toContain('暂无法打开');
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', outcome: 'ready' });
    expect(f.nav.navigateRoot).toHaveBeenCalledOnce(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
    expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('rejects a missing confirmed allocation with visible context feedback rather than silently returning', async () => {
    const f = await explicitlyReady(); (f.page as any).allocation = undefined;
    await f.page.openCompletionDevice();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'blocked', reason: 'context-changed' });
    expect(f.page.completionActionMessage).toContain('核对账号与设备');
    expect(f.management.readDeviceContextV2).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('does not enter another account after its context read returns', async () => {
    const f = await explicitlyReady();
    f.management.readDeviceContextV2.mockImplementationOnce(async () => {
      f.data.auth = { uuid: 'another-owner' }; return { ...identity };
    });
    await f.page.openCompletionDevice();
    expect(f.page.canOpenCompletion).toBe(false); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    expect(f.user.getAllInfo).not.toHaveBeenCalled(); expect(f.direct.startDirectHandoff).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('a local CAS change terminates checking as blocked instead of publishing late online or remaining busy', async () => {
    const f = setup(), cloud = deferred<ReturnType<typeof response>>();
    f.management.readProvisioningCloudV2.mockReturnValue(cloud.promise);
    const work = tracked(f.page.provision()); await turn();
    (f.page as any).confirmedIdentityContext = { ...identity, credentialVersion: 2 };
    cloud.resolve(response()); await work;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'blocked', reason: 'context-changed' });
    expect(f.page.completionChecking).toBe(false); expect(f.page.canOpenCompletion).toBe(false);
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledOnce();
  });

  it('prevents duplicate navigation and blocks a changed Cloud CAS before any journal cleanup', async () => {
    const f = await explicitlyReady(), context = deferred<typeof identity>();
    f.management.readDeviceContextV2.mockReturnValue(context.promise);
    const open = tracked(f.page.openCompletionDevice()); await turn();
    expect(f.page.canOpenCompletion).toBe(false); await f.page.openCompletionDevice();
    expect(f.management.readDeviceContextV2).toHaveBeenCalledOnce();
    context.resolve({ ...identity, credentialVersion: 2 }); await open;
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'blocked', reason: 'context-changed' });
    expect(f.store.complete).not.toHaveBeenCalled(); expect(f.nav.navigateRoot).not.toHaveBeenCalled();
  });

  it('keeps a later Local owner fenced at ready-result actions without issuing a navigation or another read', async () => {
    const f = await explicitlyReady();
    expect(f.page.completion?.outcome).toBe('ready'); expect(f.page.canOpenCompletion).toBe(true);
    const reads = f.management.readProvisioningCloudV2.mock.calls.length;
    vi.spyOn(wiFiProvCloudBoundary, 'blocked', 'get').mockReturnValue(true);
    expect(f.page.canOpenCompletion).toBe(false); expect(f.page.canCheckCompletion).toBe(false);
    await f.page.openCompletionDevice(); await f.page.checkCompletionCloud();
    expect(f.nav.navigateRoot).not.toHaveBeenCalled(); expect(f.management.readDeviceContextV2).not.toHaveBeenCalled();
    expect(f.management.readProvisioningCloudV2).toHaveBeenCalledTimes(reads);
    expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('does not publish another account completion or reopen WiFi when the account changes in flight', async () => {
    const f = setup(), cloud = deferred<ReturnType<typeof response>>();
    f.management.readProvisioningCloudV2.mockReturnValue(cloud.promise);
    const work = tracked(f.page.provision()); await turn(); f.data.auth = { uuid: 'another-owner' };
    cloud.resolve(response()); await work;
    expect(f.page.completion).toBeUndefined(); expect(f.page.canOpenCompletion).toBe(false);
    expect(f.store.complete).not.toHaveBeenCalled(); expect(WiFiProv.provision).toHaveBeenCalledOnce();
  });

  it('does not make a known native success UNKNOWN when a later observation construction fails', async () => {
    const f = setup(); const badAttempt = vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.mocked(WiFiProv.provision).mockImplementation(async () => {
      // Corrupt only the host fixture after the real invocation was captured.
      (f.page as any).completionAttempt = { ...(f.page as any).completionAttempt, attemptedAt: -1 };
      badAttempt.mockReturnValue(-1); return { success: true };
    });
    await f.page.provision();
    expect(f.page.completion).toMatchObject({ officialReceipt: 'confirmed', cloud: 'blocked', outcome: 'wifi-connected' });
    expect(f.page.wifiReceiptUnknown).toBe(false); expect(f.store.saveUnknown).not.toHaveBeenCalled();
    expect(f.management.readProvisioningCloudV2).not.toHaveBeenCalled();
  });
});
