import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
const secureValues = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return Object.assign({}, actual, { Capacitor: Object.assign({}, actual.Capacitor, { isNativePlatform: () => true }) });
});
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  keys: vi.fn(async () => [...secureValues.keys()]), getItem: vi.fn(async (key: string) => secureValues.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { secureValues.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { secureValues.delete(key); }),
} }));
vi.mock('../device-v2/ble-direct/transport', async original => {
  const actual = await original<typeof import('../device-v2/ble-direct/transport')>();
  return Object.assign({}, actual, { discoverBlinkerDevices: vi.fn() });
});
vi.mock('../injectable/server.interceptor', async () => {
  const { HttpContextToken } = await import('@angular/common/http');
  return { GATEWAY_NO_AUTH_REPLAY: new HttpContextToken(() => false) };
});
import { API } from '../../configs/api.config';
import { environment } from 'src/environments/environment';
import { localCapabilities } from 'src/environments/deployment';
import { BleApplicationMode, BleDirectClient, BleDirectCrypto, base64UrlEncode, discoverBlinkerDevices,
  CapacitorBleControllerCredentialStore, BleControllerCredential, BleDirectTarget } from '../device-v2/ble-direct';
import { HttpAccessRegistrationApi } from '../device-v2/ble-direct/access-registration-api';
import { SecureAccessRegistrationCheckpoints } from '../device-v2/ble-direct/access-registration-checkpoints';
import { AccessRegistrationIntent } from '../device-v2/ble-direct/access-registration-contract';
import { DeviceV2BleService } from './device-v2-ble.service';
import { GatewayHttpError } from '../model/response.model';
import { HttpBlePresenceKeyApi } from '../device-v2/ble-direct/presence-key-api';
import { Bc5AcceptanceClient, type Bc5AcceptanceAdmission } from '../device-v2/ble-direct/bc5-acceptance-client';
import { Bc5InstallCheckpoints } from '../device-v2/ble-direct/bc5-install-checkpoint';
import { CLOUD_REGISTRATION_CONTRACT, type IssuedCloudRegistration } from '../device-v2/ble-direct/cloud-registration-wire';
import { HttpRegistrationPresenceApi } from '../device-v2/ble-direct/registration-presence-api';
import { getServiceRegion } from '../../configs/service-region.config';

const sourceId = 'device_11111111-1111-4111-8111-111111111111';
const targetId = 'ble_AAECAwQFBgcICQoLDA0ODw';
const bytes = (size: number, byte: number) => new Uint8Array(size).fill(byte);
const b64 = (size: number, byte: number) => base64UrlEncode(bytes(size, byte));
const target = (): BleDirectTarget => ({ device: { deviceId: 'synthetic-radio-handle' },
  profile: { mode: BleApplicationMode.Direct, wireVersion: 3, modeLocator: bytes(4, 7) } as any });
const credential = (id = sourceId): BleControllerCredential => ({ source: 'wifiprov', state: 'active', logicalDeviceId: id,
  deviceInstanceId: bytes(16, 1), accessEpoch: 1, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
  credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 1, locator: b64(16, 8) },
  intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() });
const device = (id = sourceId) => ({ deviceName: id, name: 'Existing Cloud card', cloudEnabled: true,
  config: { isShared: false, disabled: false } });
const turn = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('original BleService preserving-root registration assembly', () => {
  const originalDeployment = environment.deployment;
  const services: DeviceV2BleService[] = [];
  beforeEach(() => { environment.deployment = localCapabilities; secureValues.clear(); vi.clearAllMocks(); });
  afterEach(() => { for (const service of services.splice(0)) service.ngOnDestroy();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); secureValues.clear(); environment.deployment = originalDeployment; });

  async function harness() {
    const scope = { authority: API.BASE_URL, accountId: 'registration-owner' };
    const store = new CapacitorBleControllerCredentialStore(() => scope); await store.save(credential());
    const data = { auth: { uuid: scope.accountId }, user: { id: scope.accountId }, sessionEpoch: 1,
      authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(false),
      device: { list: [sourceId], dict: { [sourceId]: device() } } as any,
      getDevice(id: string) { return this.device.dict[id]; } };
    const visibility = new BehaviorSubject(true);
    const service = new DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any, { active: visibility } as any);
    services.push(service);
    let prepared!: AccessRegistrationIntent;
    const prepare = vi.spyOn(HttpAccessRegistrationApi.prototype, 'prepare').mockImplementation(async request => {
      prepared = { intentId: request.requestId, sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: targetId,
        registrationProduct: 'ble_direct', rootBindingId: b64(16, 5), bindingRevision: 1, expectedRoot: request.expectedRoot,
        clientNonce: b64(16, 6), expiresAt: Date.now() + 120000, state: 'prepared', quotaState: 'reserved', replayed: false };
      return prepared;
    });
    const committed = () => ({ ...prepared, state: 'committed' as const, quotaState: 'consumed' as const,
      device: { logicalDeviceId: targetId, state: 'active' } });
    const commit = vi.spyOn(HttpAccessRegistrationApi.prototype, 'commit').mockImplementation(async () => committed());
    const read = vi.spyOn(HttpAccessRegistrationApi.prototype, 'read').mockImplementation(async () => committed());
    const cancel = vi.spyOn(HttpAccessRegistrationApi.prototype, 'cancel').mockImplementation(async () => ({ ...prepared,
      state: 'cancelled' as const, quotaState: 'released' as const }));
    const nativeClose = vi.fn(async () => undefined), closed = new Set<() => void>();
    const session = { close: vi.fn(async () => { for (const fn of closed) fn(); await nativeClose(); }),
      subscribeClosed(fn: () => void) { closed.add(fn); return () => closed.delete(fn); } };
    const authenticate = vi.spyOn(BleDirectClient.prototype, 'authenticateAccessRegistration').mockResolvedValue({
      session: session as any, confirmationDigest: b64(32, 9) });
    const observed = target(); vi.mocked(discoverBlinkerDevices).mockResolvedValue([observed]);
    return { service, data, visibility, store, scope, prepare, commit, read, cancel, authenticate, session, observed,
      checkpoints: new SecureAccessRegistrationCheckpoints(() => scope), prepared: () => prepared };
  }

  it('shows only same-account owned active Cloud Admin sources without returning root secrets', async () => {
    const h = await harness();
    h.data.device.dict[targetId] = { ...device(targetId), config: { isShared: true } }; h.data.device.list.push(targetId);
    await h.store.save(credential(targetId));
    const sources = await h.service.accessRegistrationSources();
    expect(sources).toEqual([{ logicalDeviceId: sourceId, displayName: 'Existing Cloud card' }]);
    expect(JSON.stringify(sources)).not.toContain('controller');
    expect(h.prepare).not.toHaveBeenCalled(); expect(discoverBlinkerDevices).not.toHaveBeenCalled();
  });

  it('requires explicit selection, then performs one fresh proof without requiring a presence key or copying scope', async () => {
    const h = await harness(), abort = new AbortController();
    const candidates = await h.service.discoverAccessRegistrationTargets(abort.signal);
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled();
    const result = await h.service.beginAccessRegistration(sourceId, 'New BLE card', abort.signal, candidates[0]);
    expect(result.intent.targetLogicalDeviceId).toBe(targetId); expect(result.localReferencePending).toBe(false);
    expect(h.prepare).toHaveBeenCalledOnce(); expect(h.commit).toHaveBeenCalledOnce(); expect(h.authenticate).toHaveBeenCalledOnce();
    expect(h.authenticate.mock.calls[0][1]).toBe(h.observed); expect(h.session.close).toHaveBeenCalledOnce();
    const original = await h.store.load(sourceId), added = await h.store.load(targetId);
    expect(original?.rootCredentialRef).toBe(added?.rootCredentialRef); expect(added?.source).toBe('access-registration');
    expect(added?.presenceKeys).toBeUndefined(); expect(added?.cloudContext).toBeUndefined();
    expect((await h.service.accessRegistrationCheckpoints())[0].intent?.state).toBe('committed');
  });

  it('rejects a fabricated or stale selected target before preparing or authenticating', async () => {
    const h = await harness(), signal = new AbortController().signal;
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, target())).rejects.toThrow('TARGET_REQUIRED');
    const candidates = await h.service.discoverAccessRegistrationTargets(signal);
    h.visibility.next(false); h.visibility.next(true);
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, candidates[0])).rejects.toThrow('TARGET_REQUIRED');
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled();
  });

  it('does not choose an arbitrary v3 advertisement when no explicit target or presence credential exists', async () => {
    const h = await harness();
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', new AbortController().signal))
      .rejects.toThrow('PRESENCE_CREDENTIAL_NOT_FOUND');
    expect(h.prepare).not.toHaveBeenCalled(); expect(discoverBlinkerDevices).not.toHaveBeenCalled();
  });

  it('rejects a cached selection after its original page discovery owner was cancelled', async () => {
    const h = await harness(), selection = new AbortController();
    const [selected] = await h.service.discoverAccessRegistrationTargets(selection.signal); selection.abort();
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', new AbortController().signal, selected))
      .rejects.toThrow('TARGET_REQUIRED');
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled();
  });

  it('recovers an unknown commit through GET only, without scanning or repeating authentication or commit', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    h.commit.mockRejectedValueOnce(Error('SYNTHETIC_RESPONSE_LOSS'));
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, selected)).rejects.toThrow('RESPONSE_LOSS');
    const [pending] = await h.service.accessRegistrationCheckpoints(); expect(pending.phase).toBe('unknown');
    await expect(h.service.beginAccessRegistration(sourceId, 'Another name', signal, selected)).rejects.toThrow('RECOVERY_REQUIRED');
    expect(h.prepare).toHaveBeenCalledOnce();
    const scans = vi.mocked(discoverBlinkerDevices).mock.calls.length;
    const recovered = await h.service.recoverAccessRegistration(pending.request.requestId, signal);
    expect(recovered.intent.state).toBe('committed'); expect(h.read).toHaveBeenCalledOnce();
    expect(h.authenticate).toHaveBeenCalledOnce(); expect(h.commit).toHaveBeenCalledOnce();
    expect(discoverBlinkerDevices).toHaveBeenCalledTimes(scans);
    await h.service.clearAccessRegistration(pending.request.requestId, signal);
    expect(await h.service.accessRegistrationCheckpoints()).toEqual([]);
  });
  it('allows a new explicitly selected operation after exact rejected prepare but never replays the rejected request', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    h.prepare.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 409,
      code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING', message: 'Pending source presence' }));
    await expect(h.service.beginAccessRegistration(sourceId, 'First attempt', signal, selected)).rejects.toThrow('Pending source presence');
    const [rejected] = await h.service.accessRegistrationCheckpoints(); expect(rejected.phase).toBe('rejected');
    const [fresh] = await h.service.discoverAccessRegistrationTargets(signal);
    expect((await h.service.beginAccessRegistration(sourceId, 'New explicit attempt', signal, fresh)).intent.state).toBe('committed');
    expect(h.prepare).toHaveBeenCalledTimes(2);
    expect(h.prepare.mock.calls[0][0].requestId).not.toBe(h.prepare.mock.calls[1][0].requestId);
    expect(h.authenticate).toHaveBeenCalledOnce(); expect(h.commit).toHaveBeenCalledOnce();
    expect((await h.service.accessRegistrationCheckpoints()).find(row=>row.request.requestId===rejected.request.requestId)?.phase).toBe('rejected');
  });
  it('keeps generic prepare failures UNKNOWN and blocks a second source operation', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    h.prepare.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 404,
      code: 'ACCESS_REGISTRATION_NOT_FOUND', message: 'Missing registration' }));
    await expect(h.service.beginAccessRegistration(sourceId, 'First attempt', signal, selected)).rejects.toThrow('Missing registration');
    const [pending] = await h.service.accessRegistrationCheckpoints(); expect(pending.phase).toBe('unknown');
    await expect(h.service.beginAccessRegistration(sourceId, 'Not a retry', signal, selected)).rejects.toThrow('RECOVERY_REQUIRED');
    expect(h.prepare).toHaveBeenCalledOnce(); expect(h.authenticate).not.toHaveBeenCalled();
  });
  async function initialSource() {
    const h = await harness(), controller = new AbortController(), key = bytes(16, 7);
    const digest = await new BleDirectCrypto().sha256(key);
    const source = credential(); source.presenceKeys = [{ state: 'current', accessEpoch: 1, version: 1, key: key.slice() }];
    await h.store.save(source); (h.observed.profile as any).wireVersion = 2;
    const bundle = (confirmed = false) => ({ logicalDeviceId: sourceId, replayed: true, previous: null,
      current: { accessEpoch: 1, version: 1, key: key.slice(), keyDigest: digest.slice(), deviceConfirmed: confirmed } });
    let confirmed = false;
    const reveal = vi.spyOn(HttpBlePresenceKeyApi.prototype, 'reveal').mockImplementation(async () => bundle(confirmed));
    const confirm = vi.spyOn(HttpBlePresenceKeyApi.prototype, 'confirm').mockImplementation(async () => { confirmed = true; return bundle(true); });
    const allocate = vi.spyOn(HttpBlePresenceKeyApi.prototype, 'allocate'), rotate = vi.spyOn(HttpBlePresenceKeyApi.prototype, 'rotate');
    const receipt = { encoded: bytes(60, 2), proof: bytes(32, 5), keyDigest: digest.slice() };
    const closed = new Set<() => void>();
    const sourceSession = { logicalDeviceId: sourceId, state: 'ready', replacePresenceKey: vi.fn(async () => receipt),
      subscribeClosed(fn: () => void) { closed.add(fn); return () => closed.delete(fn); },
      close: vi.fn(async () => { for (const fn of closed) fn(); }) };
    const connect = vi.spyOn(BleDirectClient.prototype, 'connect').mockResolvedValue(sourceSession as any);
    const internal = h.service as any, context = internal.accountContext();
    const run = () => internal.confirmInitialSourcePresence(source, h.observed, context,
      () => controller.signal.throwIfAborted(), controller.signal);
    return { ...h, source, sourceSession, controller, bundle, reveal, confirm, allocate, rotate, receipt, connect, run };
  }
  it('confirms one original initial key with a fresh source Method2 before prepare, then uses a separate nonce Method2', async () => {
    const h = await initialSource(), order: string[] = [], signal = h.controller.signal;
    const originalPrepare = h.prepare.getMockImplementation()!, originalAuthenticate = h.authenticate.getMockImplementation()!;
    h.prepare.mockImplementation(async (...args) => { order.push('prepare'); return originalPrepare(...args); });
    h.authenticate.mockImplementation(async (...args) => { order.push('nonce-method2'); return originalAuthenticate(...args); });
    h.connect.mockImplementation(async () => { order.push('source-method2'); return h.sourceSession as any; });
    h.sourceSession.replacePresenceKey.mockImplementation(async () => { order.push('install'); return h.receipt; });
    const close = h.sourceSession.close.getMockImplementation()!;
    h.sourceSession.close.mockImplementation(async () => { order.push('source-close'); await close(); });
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    expect((await h.service.beginAccessRegistration(sourceId, 'New explicit card', signal, selected)).intent.state).toBe('committed');
    expect(order).toEqual(['source-method2', 'install', 'source-close', 'prepare', 'nonce-method2']);
    expect(h.connect).toHaveBeenCalledExactlyOnceWith(sourceId, selected);
    expect(h.sourceSession.replacePresenceKey).toHaveBeenCalledOnce(); expect(h.confirm).toHaveBeenCalledOnce();
    expect(h.confirm.mock.calls[0][0]).toBe(sourceId); expect(h.reveal).toHaveBeenCalledTimes(2);
    expect(h.allocate).not.toHaveBeenCalled(); expect(h.rotate).not.toHaveBeenCalled();
    expect(h.authenticate.mock.calls[0][0].clientNonce).toBe(h.prepared().clientNonce);
    expect(h.sourceSession.close).toHaveBeenCalledOnce(); expect(h.session.close).toHaveBeenCalledOnce();
  });
  it('skips the pre-prepare write when the exact existing initial material is already confirmed', async () => {
    const h = await initialSource(); h.reveal.mockResolvedValueOnce(h.bundle(true));
    await h.run(); expect(h.reveal).toHaveBeenCalledOnce(); expect(h.connect).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled(); expect(h.allocate).not.toHaveBeenCalled();
  });
  it('leaves exact missing initial material to the after-commit initializer without allocating', async () => {
    const h = await initialSource(); h.reveal.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 404,
      code: 'DEVICE_V2_PRESENCE_NOT_FOUND', message: 'No material' }));
    await h.run(); expect(h.connect).not.toHaveBeenCalled(); expect(h.allocate).not.toHaveBeenCalled();
  });
  it.each(['shared-root', 'current-v3'] as const)('does not reveal or replay a %s source in the narrow initial step', async field => {
    const h = await initialSource();
    if (field === 'shared-root') h.source.rootCredentialRef = b64(16, 8); else (h.observed.profile as any).wireVersion = 3;
    await h.run(); expect(h.reveal).not.toHaveBeenCalled(); expect(h.connect).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });
  it.each(['alias', 'rotation', 'version', 'previous', 'epoch', 'local-missing', 'local-key'] as const)(
    'refuses %s without a source connection or material write', async field => {
      const h = await initialSource();
      if (field === 'alias') h.source.source = 'access-registration';
      else if (field === 'rotation') h.source.keyRotation = { phase: 'prepared', operationId: b64(16, 4),
        previousContext: { credentialVersion: 1, locator: b64(16, 8) } };
      else if (field === 'version') h.reveal.mockResolvedValueOnce({ ...h.bundle(), current: { ...h.bundle().current, version: 2 } });
      else if (field === 'previous') h.reveal.mockResolvedValueOnce({ ...h.bundle(), previous: h.bundle(true).current } as any);
      else if (field === 'epoch') h.reveal.mockResolvedValueOnce({ ...h.bundle(), current: { ...h.bundle().current, accessEpoch: 2 } });
      else if (field === 'local-missing') h.source.presenceKeys = undefined;
      else h.source.presenceKeys![0].key = bytes(16, 9);
      await expect(h.run()).rejects.toThrow('ROOT_OPERATION_PENDING');
      expect(h.connect).not.toHaveBeenCalled(); expect(h.confirm).not.toHaveBeenCalled(); expect(h.allocate).not.toHaveBeenCalled();
    });
  it('retains an uncertain install without prepare, confirm retry or a second source Method2', async () => {
    const h = await initialSource(); h.sourceSession.replacePresenceKey.mockRejectedValueOnce(Error('INSTALL_UNKNOWN'));
    const [selected] = await h.service.discoverAccessRegistrationTargets(h.controller.signal);
    await expect(h.service.beginAccessRegistration(sourceId, 'New card', h.controller.signal, selected)).rejects.toThrow('INSTALL_UNKNOWN');
    expect(h.connect).toHaveBeenCalledOnce(); expect(h.sourceSession.replacePresenceKey).toHaveBeenCalledOnce();
    expect(h.confirm).not.toHaveBeenCalled(); expect(h.prepare).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled();
    expect(h.sourceSession.close).toHaveBeenCalledOnce(); expect((await h.store.load(sourceId))?.presenceKeys?.[0].version).toBe(1);
  });
  it('does not prepare when confirm readback is still uncertain, and does not retry the mutation', async () => {
    const h = await initialSource(); h.reveal.mockImplementation(async () => h.bundle());
    const [selected] = await h.service.discoverAccessRegistrationTargets(h.controller.signal);
    await expect(h.service.beginAccessRegistration(sourceId, 'New card', h.controller.signal, selected)).rejects.toThrow('ROOT_OPERATION_PENDING');
    expect(h.sourceSession.replacePresenceKey).toHaveBeenCalledOnce(); expect(h.confirm).toHaveBeenCalledOnce();
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.sourceSession.close).toHaveBeenCalledOnce();
  });
  it('a failed source release cannot authorize the next registration connection', async () => {
    const h = await initialSource(); h.sourceSession.close.mockRejectedValueOnce(Error('NATIVE_RELEASE_FAILED'));
    const [selected] = await h.service.discoverAccessRegistrationTargets(h.controller.signal);
    await expect(h.service.beginAccessRegistration(sourceId, 'New card', h.controller.signal, selected)).rejects.toThrow('NATIVE_RELEASE_FAILED');
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled();
  });
  it('cancellation after read never opens a source session or sends prepare', async () => {
    const h = await initialSource(); h.reveal.mockImplementationOnce(async () => { h.controller.abort(Error('CANCELLED')); return h.bundle(); });
    await expect(h.run()).rejects.toThrow('CANCELLED');
    expect(h.connect).not.toHaveBeenCalled(); expect(h.confirm).not.toHaveBeenCalled(); expect(h.prepare).not.toHaveBeenCalled();
  });

  it('retires a late prepare on background without auto-authenticating or retrying on return', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    const actualPrepare = h.prepare.getMockImplementation()!;
    let finish!: () => void;
    h.prepare.mockImplementationOnce((request, requestSignal) => new Promise(resolve => {
      finish = () => { void actualPrepare(request, requestSignal).then(resolve); };
    }));
    const operation = h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, selected);
    await turn(); // crypto is asynchronous; wait until the controlled prepare is entered.
    for (let i = 0; !finish && i < 20; i++) await new Promise(resolve => setTimeout(resolve, 2));
    expect(finish).toBeTypeOf('function');
    expect(() => h.service.ensureReady(sourceId)).toThrow('ACCESS_REGISTRATION_BUSY');
    h.visibility.next(false); finish(); await expect(operation).rejects.toThrow(); h.visibility.next(true); await turn();
    expect(h.authenticate).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
    expect(h.prepare).toHaveBeenCalledOnce(); expect(h.read).not.toHaveBeenCalled();
    expect((await h.service.accessRegistrationCheckpoints())[0].phase).toBe('preparing');
  });

  it('isolates account replacement and refuses the old discovery result before any new write', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    h.data.auth = { uuid: 'replacement-owner' }; h.data.user = { id: 'replacement-owner' };
    h.data.sessionEpoch++; h.data.authDataChanged.next();
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, selected)).rejects.toThrow('TARGET_REQUIRED');
    expect(h.prepare).not.toHaveBeenCalled(); expect(await h.service.accessRegistrationCheckpoints()).toEqual([]);
  });

  it('lists only bounded same-account non-secret checkpoints and never queries the Gateway', async () => {
    const h = await harness(), other = new SecureAccessRegistrationCheckpoints(() => ({ ...h.scope, accountId: 'another-account' }));
    const request = { requestId: b64(16, 4), sourceLogicalDeviceId: sourceId, targetProduct: 'ble_direct' as const,
      name: 'Fixture', expectedRoot: { deviceInstanceId: b64(16, 1), accessEpoch: 1, controllerId: b64(16, 2),
        credentialVersion: 1 as const, adminFingerprint: b64(32, 3), cloudCredentialVersion: 1 } };
    await h.checkpoints.save({ request, commitId: b64(16, 5), phase: 'preparing' });
    await other.save({ request: { ...request, requestId: b64(16, 6) }, commitId: b64(16, 7), phase: 'unknown' });
    const items = await h.service.accessRegistrationCheckpoints();
    expect(items).toHaveLength(1); expect(items[0].request.requestId).toBe(request.requestId);
    expect(JSON.stringify(items)).not.toContain('controllerSecret'); expect(h.read).not.toHaveBeenCalled();
  });

  async function reverseAlias() {
    vi.stubGlobal('localStorage', { getItem: () => 'Development' });
    // Match the reverse-registration generator, not ordinary create's UUID.
    const h = await harness(), bleSource = targetId, cloudTarget = 'device_' + b64(16, 22);
    const crypto = new BleDirectCrypto(), presence = bytes(16, 11);
    const source: BleControllerCredential = { ...credential(bleSource), source: 'enrollment', cloudContext: undefined,
      intentId: bytes(16, 12), commitId: bytes(16, 13), receipt: bytes(16, 14),
      presenceKeys: [{ state: 'current', accessEpoch: 1, version: 1, key: presence }] };
    await h.store.save(source);
    const admission: Bc5AcceptanceAdmission = { origin: h.scope.authority, ownerUserId: h.scope.accountId,
      tenantId: 'tenant', sourceLogicalDeviceId: bleSource, intentId: b64(16, 15),
      region: getServiceRegion(), expiresAt: Date.now() + 60_000 };
    const root = { deviceInstanceId: b64(16, 1), accessEpoch: 1, controllerId: b64(16, 2), credentialVersion: 1 as const,
      adminFingerprint: base64UrlEncode(await crypto.adminFingerprint(source.controllerId, source.controllerSecret)) };
    const issued: IssuedCloudRegistration = { contract: CLOUD_REGISTRATION_CONTRACT, state: 'key_issued',
      ownerUserId: admission.ownerUserId, tenantId: admission.tenantId, intentId: admission.intentId,
      sourceLogicalDeviceId: bleSource, targetLogicalDeviceId: cloudTarget, clientNonce: b64(16, 16), expiresAt: 400,
      expectedRoot: { ...root, kind: 'ble-no-cloud-key-v2', cloudKey: { state: 'absent' } },
      targetKey: { credentialVersion: 1, locator: b64(16, 17), issuanceDigest: b64(32, 18), issuedAt: 100 } };
    const committed = { ...issued, state: 'committed', quotaState: 'consumed', registrationProduct: 'cloud',
      materialOwnerLogicalDeviceId: bleSource, rootBindingId: b64(16, 19), bindingRevision: 1, committedAt: 200,
      device: { logicalDeviceId: cloudTarget, tenantId: 'tenant', registrationProduct: 'cloud', state: 'active',
        cloudEnabled: true, credentialVersion: 1 } };
    const commitId = b64(16, 20), abort = new AbortController();
    const checkpoint = { issued, commitId, recordedAt: 150, armedAt: 175 };
    const exact = vi.spyOn(Bc5AcceptanceClient.prototype, 'readExactCommitted').mockResolvedValue({
      checkpoint, authoritativeCommitId: commitId, committed });
    const legacy = vi.spyOn(Bc5AcceptanceClient.prototype, 'recoverInstall');
    vi.spyOn(h.service as unknown as { assertBc5Cloud(): Promise<void> }, 'assertBc5Cloud').mockResolvedValue();
    const keyDigest = base64UrlEncode(await crypto.sha256(presence));
    const presenceRead = vi.spyOn(HttpRegistrationPresenceApi.prototype, 'read').mockImplementation(async id => ({
      contract: 'access-registration-presence-v1', logicalDeviceId: id, rootBindingId: committed.rootBindingId,
      bindingRevision: 1, expectedRoot: { ...root, cloudCredentialVersion: 1 }, materialOwnerLogicalDeviceId: bleSource,
      canWritePresence: id === bleSource, keys: [{ state: 'current', accessEpoch: 1, version: 1, key: b64(16, 11), keyDigest }] }));
    return { ...h, bleSource, cloudTarget, admission, abort, exact, legacy, presenceRead, checkpoint,
      run: () => h.service.restoreCommittedBc5PresenceAlias(admission, abort.signal) };
  }

  it('diagnoses one original source without consulting either commit route, target, radio, or store writes', async () => {
    const h = await reverseAlias();
    const load = vi.spyOn(Bc5InstallCheckpoints.prototype, 'load').mockResolvedValue(h.checkpoint);
    const cas = vi.spyOn(CapacitorBleControllerCredentialStore.prototype, 'restoreCommittedBc5PresenceAlias');
    await expect(h.service.diagnoseBc5SourcePresence(h.admission, h.abort.signal)).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledOnce();
    expect(h.presenceRead.mock.calls.map(([id]) => id)).toEqual([h.bleSource]);
    expect(h.exact).not.toHaveBeenCalled(); expect(h.legacy).not.toHaveBeenCalled(); expect(cas).not.toHaveBeenCalled();
    expect(discoverBlinkerDevices).not.toHaveBeenCalled();
  });

  it('refuses to diagnose without the original armed checkpoint', async () => {
    const h = await reverseAlias();
    vi.spyOn(Bc5InstallCheckpoints.prototype, 'load').mockResolvedValue({ ...h.checkpoint, armedAt: undefined });
    await expect(h.service.diagnoseBc5SourcePresence(h.admission, h.abort.signal)).rejects.toThrow('COMMIT_REQUIRED');
    expect(h.presenceRead).not.toHaveBeenCalled(); expect(h.exact).not.toHaveBeenCalled();
  });

  it('recovers only the nearby alias from exact committed read in one foreground operation', async () => {
    const h = await reverseAlias(), source = await h.store.load(h.bleSource);
    expect(await h.run()).toBe(true);
    expect(h.exact).toHaveBeenCalledOnce(); expect(h.legacy).not.toHaveBeenCalled();
    expect(h.presenceRead.mock.calls.map(([id]) => id)).toEqual([h.bleSource, h.cloudTarget]);
    expect(await h.store.load(h.bleSource)).toEqual(source);
    expect(await h.store.load(h.cloudTarget)).toBeUndefined();
    expect(await h.store.readBc5PresenceAlias(h.cloudTarget)).toMatchObject({ sourceLogicalDeviceId: h.bleSource });
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled();
    expect(discoverBlinkerDevices).not.toHaveBeenCalled();
  });

  it('does not apply a late alias when the foreground operation is cancelled', async () => {
    const h = await reverseAlias(), read = h.presenceRead.getMockImplementation()!;
    h.presenceRead.mockImplementation(async (id, signal) => {
      if (id === h.cloudTarget) h.visibility.next(false);
      return read(id, signal);
    });
    await expect(h.run()).rejects.toThrow();
    expect(h.exact).toHaveBeenCalledOnce(); expect(h.legacy).not.toHaveBeenCalled();
    expect(h.presenceRead).toHaveBeenCalledTimes(2);
    expect(await h.store.readBc5PresenceAlias(h.cloudTarget)).toBeUndefined();
  });

  it('returns pending local cleanup for UNKNOWN and deletes only an active confirmed card reference', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    h.commit.mockRejectedValueOnce(Error('SYNTHETIC_RESPONSE_LOSS'));
    await expect(h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, selected)).rejects.toThrow();
    expect(await h.service.retireDeletedRegistration(targetId)).toEqual({ cleanupPending: true });
    expect((await h.store.load(sourceId))?.state).toBe('active');
    const [pending] = await h.service.accessRegistrationCheckpoints();
    await h.service.recoverAccessRegistration(pending.request.requestId, signal);
    expect(await h.service.retireDeletedRegistration(targetId)).toEqual({ cleanupPending: false });
    expect(await h.store.load(targetId)).toBeUndefined(); expect((await h.store.load(sourceId))?.state).toBe('active');
    expect(await h.checkpoints.load(pending.request.requestId)).toBeDefined();
  });

  it('closes affected normal sessions only for explicit root invalidation, and fences every shared reference', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    await h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, selected);
    const disconnect = vi.spyOn(h.service, 'disconnect').mockResolvedValue();
    await h.service.knownRootChanged(sourceId);
    expect(disconnect.mock.calls.map(call => call[0])).toContain(targetId);
    await expect(h.store.load(sourceId)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
    await expect(h.store.load(targetId)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
    await h.service.knownRootChanged(sourceId); // Stable explicit coordination, no auth or network replay.
    expect(h.authenticate).toHaveBeenCalledOnce(); expect(h.prepare).toHaveBeenCalledOnce();
  });
  it('retires only the deleted card connection while preserving another active shared-root registration', async () => {
    const h = await harness(), signal = new AbortController().signal;
    const [selected] = await h.service.discoverAccessRegistrationTargets(signal);
    await h.service.beginAccessRegistration(sourceId, 'New BLE card', signal, selected);
    const disconnect = vi.spyOn(h.service, 'disconnect').mockResolvedValue(undefined);
    await h.store.removeDeletedRegistration(sourceId); await turn();
    expect(disconnect).toHaveBeenCalledExactlyOnceWith(sourceId);
    expect((await h.store.load(targetId))?.state).toBe('active');
    expect(await h.store.load(sourceId)).toBeUndefined();
  });
});
