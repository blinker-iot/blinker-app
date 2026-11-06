import { describe, expect, it } from 'vitest';
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
import { BleApplicationMode, BleDirectClient, deriveBlePresenceLocator, base64UrlEncode } from '../device-v2/ble-direct';
import * as service from './device-v2-ble.service';
import { API } from '../../configs/api.config';
import { environment } from 'src/environments/environment';
import { localCapabilities } from 'src/environments/deployment';
import { BleDirectCrypto } from '../device-v2/ble-direct/crypto';
import { CapacitorBleControllerCredentialStore, type BleControllerCredential } from '../device-v2/ble-direct/credential-store';
import { HttpRegistrationPresenceApi } from '../device-v2/ble-direct/registration-presence-api';
import type { RegistrationPresenceBinding } from '../device-v2/ble-direct/registration-presence-contract';
import { HttpBlePresenceKeyApi } from '../device-v2/ble-direct/presence-key-api';
import { bleScanner } from '../bluetooth/scan';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { GatewayHttpError } from '../model/response.model';

const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
const sourceId = 'device_11111111-1111-4111-8111-111111111111';
const aliasId = 'ble_AgICAgICAgICAgICAgICAg';
const reference = () => ({ rootBindingId: base64UrlEncode(bytes(16, 5)), bindingRevision: 1,
  materialOwnerLogicalDeviceId: sourceId });
const candidate = (logicalDeviceId = sourceId): any => ({ logicalDeviceId,
  deviceInstanceId: bytes(16, 1), accessEpoch: 1, version: 2, key: bytes(16, 3),
  registrationBinding: reference() });
async function profile() {
  const c = candidate();
  return { mode: BleApplicationMode.Direct, wireVersion: 3, capabilities: 0x51,
    modeLocator: await deriveBlePresenceLocator(c.key, {
      deviceInstanceId: c.deviceInstanceId, accessEpoch: c.accessEpoch, presenceKeyVersion: c.version,
    }, bytes(4, 4)) };
}
const matches = (p: unknown, candidates: unknown[]) =>
  (service as any).matchAuthorizedBlePresenceRegistrations(p, candidates) as Promise<string[]>;

describe('IP-3 one physical observation with explicitly authorized per-card projection', () => {
  it('projects a verified same-root/version observation only to both explicitly authorized cards', async () => {
    expect(await matches(await profile(), [candidate(), candidate(aliasId)])).toEqual([sourceId, aliasId].sort());
  });
  it('keeps identical MAC/instance/key records ambiguous without individual registered bindings', async () => {
    const a = candidate(), b = candidate(aliasId);
    delete a.registrationBinding; delete b.registrationBinding;
    expect(await matches(await profile(), [a, b])).toEqual([]);
  });
  it.each(['root', 'revision', 'owner', 'unbound'] as const)('does not fold %s ambiguity into a shared physical match', async field => {
    const other = candidate(aliasId);
    if (field === 'root') other.registrationBinding.rootBindingId = base64UrlEncode(bytes(16, 7));
    else if (field === 'revision') other.registrationBinding.bindingRevision++;
    else if (field === 'owner') other.registrationBinding.materialOwnerLogicalDeviceId = aliasId;
    else delete other.registrationBinding;
    expect(await matches(await profile(), [candidate(), other])).toEqual([]);
  });
  it('retains original single-card current/previous matching without inventing a second card', async () => {
    const original = candidate(); delete original.registrationBinding;
    const unrelated = candidate(aliasId); unrelated.key = bytes(16, 9);
    expect(await matches(await profile(), [original, unrelated])).toEqual([sourceId]);
  });
  it('never uses provisioning advertisements or old profiles as daily Direct nearby evidence', async () => {
    expect(await matches({ ...await profile(), mode: BleApplicationMode.Provisioning }, [candidate()])).toEqual([]);
    expect(await matches({ ...await profile(), wireVersion: 2 }, [candidate()])).toEqual([]);
  });
});

describe('IP-3 original service presence consumers', () => {
  const originalDeployment = environment.deployment;
  const services: service.DeviceV2BleService[] = [];
  beforeEach(() => { secureValues.clear(); environment.deployment = localCapabilities; vi.clearAllMocks();
    vi.spyOn(BleClient, 'initialize').mockResolvedValue(); });
  afterEach(() => { for (const instance of services.splice(0)) instance.ngOnDestroy();
    vi.restoreAllMocks(); secureValues.clear(); environment.deployment = originalDeployment; });
  async function harness() {
    const scope = { authority: API.BASE_URL, accountId: 'presence-registration-fixture' };
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    const root = { deviceInstanceId: base64UrlEncode(bytes(16, 1)), accessEpoch: 1,
      controllerId: base64UrlEncode(bytes(16, 2)), credentialVersion: 1 as const,
      adminFingerprint: base64UrlEncode(await new BleDirectCrypto().adminFingerprint(bytes(16, 2), bytes(32, 3))),
      cloudCredentialVersion: 1 };
    const source: BleControllerCredential = { logicalDeviceId: sourceId, source: 'wifiprov', state: 'active',
      deviceInstanceId: bytes(16, 1), accessEpoch: 1, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
      credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 1, locator: base64UrlEncode(bytes(16, 8)) },
      intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() };
    await store.save(source);
    const intentId = base64UrlEncode(bytes(16, 7));
    await store.prepareAccessRegistrationReference({ sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: aliasId,
      rootBindingId: reference().rootBindingId, bindingRevision: 1, expectedRoot: root, intentId, commitId: bytes(16, 8) });
    await store.confirmAccessRegistrationReference(aliasId, intentId);
    const digest = await new BleDirectCrypto().sha256(bytes(16, 3));
    const binding = (id: string, keys = true): RegistrationPresenceBinding => ({
      contract: 'access-registration-presence-v1', logicalDeviceId: id, ...reference(), expectedRoot: root,
      canWritePresence: id === sourceId, keys: keys ? [{ state: 'current', accessEpoch: 1, version: 2,
        key: base64UrlEncode(bytes(16, 3)), keyDigest: base64UrlEncode(digest) }] : [],
    });
    const read = vi.spyOn(HttpRegistrationPresenceApi.prototype, 'read').mockImplementation(async id => binding(id));
    const original = {
      sync: vi.spyOn(HttpBlePresenceKeyApi.prototype, 'sync'),
      allocate: vi.spyOn(HttpBlePresenceKeyApi.prototype, 'allocate'),
      rotate: vi.spyOn(HttpBlePresenceKeyApi.prototype, 'rotate'),
      confirm: vi.spyOn(HttpBlePresenceKeyApi.prototype, 'confirm'),
    };
    const devices: Record<string, any> = {
      [sourceId]: { cloudEnabled: true, config: { isShared: false, disabled: false }, isOnline: false },
      [aliasId]: { cloudEnabled: false, config: { isShared: false, disabled: false }, isOnline: false },
    };
    const data = { auth: { uuid: scope.accountId }, user: { id: scope.accountId }, sessionEpoch: 1,
      authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(false),
      device: { list: [sourceId, aliasId] }, getDevice: (id: string) => devices[id] };
    const active = new BehaviorSubject(true);
    const instance = new service.DeviceV2BleService({} as any, { save: vi.fn() } as any, data as any, { active } as any);
    services.push(instance);
    return { instance, store, binding, read, original, source, active, data, devices, digest };
  }
  it('reads an alias and its one exact existing material owner, with no allocation, radio or device install', async () => {
    const h = await harness(), scan = vi.spyOn(bleScanner, 'run');
    await h.instance.syncPresenceCredential(aliasId);
    expect(h.read.mock.calls.map(call => call[0])).toEqual([aliasId, sourceId]);
    expect((await h.store.load(aliasId))?.presenceBinding?.canWritePresence).toBe(false);
    expect((await h.store.load(sourceId))?.presenceBinding?.canWritePresence).toBe(true);
    for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
    h.read.mockClear(); await h.instance.syncPresenceCredential(aliasId);
    expect(h.read.mock.calls.map(call => call[0])).toEqual([aliasId]);
  });
  it('denies alias rotation before using the original mutation API', async () => {
    const h = await harness();
    await expect(h.instance.rotatePresenceCredential(aliasId, 'fixture-presence-rotation'))
      .rejects.toThrow('ACCESS_REGISTRATION_SHARED_ROOT_OPERATION_REQUIRED');
    for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
  });
  it('gives a no-material alias a concrete setup gate instead of allocating version one', async () => {
    const h = await harness(); h.read.mockImplementation(async id => h.binding(id, false));
    await expect(h.instance.syncPresenceCredential(aliasId)).rejects.toThrow('ACCESS_REGISTRATION_PRESENCE_SETUP_REQUIRED');
    for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
  });
  it('keeps an unconfirmed install candidate visible only to its original writer and out of nearby discovery', async () => {
    const h = await harness(), scan = vi.spyOn(bleScanner, 'run');
    h.read.mockImplementation(async id => h.binding(id, false));
    h.original.sync.mockResolvedValue({ logicalDeviceId: sourceId, replayed: true, previous: null,
      current: { accessEpoch: 1, version: 1, key: bytes(16, 6),
        keyDigest: await new BleDirectCrypto().sha256(bytes(16, 6)), deviceConfirmed: false } });
    await expect(h.instance.syncPresenceCredential(sourceId)).rejects.toThrow('BLE_DIRECT_SESSION_NOT_READY');
    const writer = await h.store.load(sourceId), alias = await h.store.load(aliasId);
    expect(writer?.presenceWriteCandidate?.version).toBe(1); expect(writer?.presenceKeys ?? []).toEqual([]);
    expect(alias?.presenceWriteCandidate).toBeUndefined(); expect(alias?.presenceKeys).toBeUndefined();
    await h.instance.refreshPresence([sourceId, aliasId]);
    expect(scan).not.toHaveBeenCalled(); expect(h.instance.nearbySnapshot(sourceId)).toBe(false);
    expect(h.instance.nearbySnapshot(aliasId)).toBe(false); expect(h.original.confirm).not.toHaveBeenCalled();
  });
  it('does not backfill an alias grant from a late read after background cancellation', async () => {
    const h = await harness(); let finish!: (value: RegistrationPresenceBinding) => void;
    h.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const work = h.instance.syncPresenceCredential(aliasId), failed = expect(work).rejects.toThrow();
    await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
    const signal = h.read.mock.calls[0][1]; h.active.next(false); expect(signal.aborted).toBe(true);
    finish(h.binding(aliasId)); await failed;
    expect((await h.store.load(aliasId))?.presenceBinding).toBeUndefined();
    expect(h.read).toHaveBeenCalledOnce(); for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
  });
  it('uses the existing bounded scanner to publish both proven card projections without changing Cloud online', async () => {
    const h = await harness(); await h.instance.syncPresenceCredential(aliasId);
    const p = await profile();
    const scan = vi.spyOn(bleScanner, 'run').mockImplementation(async (_filter, _timeout, _signal, observe) => {
      observe({ device: { deviceId: 'synthetic-only-native-handle' }, serviceData: {
        '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32': new DataView(Uint8Array.of(
          1, BleApplicationMode.Direct, 3, 0x51, 0, ...p.modeLocator,
        ).buffer),
      } } as any, () => undefined);
    });
    await h.instance.refreshPresence([sourceId, aliasId]);
    expect(scan).toHaveBeenCalledOnce(); expect(h.instance.nearbySnapshot(sourceId)).toBe(true);
    expect(h.instance.nearbySnapshot(aliasId)).toBe(true);
    expect(h.devices[sourceId].isOnline).toBe(false); expect(h.devices[aliasId].isOnline).toBe(false);
  });
  it('does not access the retired source card when reading its surviving registered alias', async () => {
    const h = await harness(); await h.store.removeDeletedRegistration(sourceId); delete h.devices[sourceId];
    await h.instance.syncPresenceCredential(aliasId);
    expect(h.read.mock.calls.map(call => call[0])).toEqual([aliasId]);
    expect((await h.store.load(aliasId))?.presenceBinding?.materialOwnerLogicalDeviceId).toBe(sourceId);
    expect((await h.store.load(aliasId))?.presenceKeys).toHaveLength(1);
    for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
  });
  it('shares one bounded read while one cancelled waiter cannot cancel another active waiter', async () => {
    const h = await harness(); let finish!: (value: RegistrationPresenceBinding) => void;
    h.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const a = new AbortController(), b = new AbortController(), internal = h.instance as any;
    const first = internal.readRegistrationPresence(aliasId, internal.accountContext(), a.signal);
    const second = internal.readRegistrationPresence(aliasId, internal.accountContext(), b.signal);
    await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
    const request = h.read.mock.calls[0][1]; a.abort(); await expect(first).rejects.toThrow();
    expect(request.aborted).toBe(false); finish(h.binding(aliasId));
    expect((await second).logicalDeviceId).toBe(aliasId);
    expect(h.read.mock.calls.map(call => call[0])).toEqual([aliasId, sourceId]);
  });
  it('uses the writer-only pending key for an explicit authenticated connection, not nearby evidence', async () => {
    const h = await harness(); await h.store.applyRegistrationPresence(h.binding(sourceId, false));
    await h.store.saveRegistrationPresenceCandidate(sourceId,
      { state: 'current', accessEpoch: 1, version: 1, key: bytes(16, 6) });
    const p = { mode: BleApplicationMode.Direct, wireVersion: 3, capabilities: 0x51,
      modeLocator: await deriveBlePresenceLocator(bytes(16, 6), {
        deviceInstanceId: bytes(16, 1), accessEpoch: 1, presenceKeyVersion: 1,
      }, bytes(4, 4)) };
    const target = { device: { deviceId: 'synthetic-pending-writer-target' }, profile: p };
    const closed = new Set<() => void>(), session = {
      close: vi.fn(async () => { for (const callback of closed) callback(); }),
      subscribeClosed(callback: () => void) { closed.add(callback); return () => closed.delete(callback); },
    };
    const authenticated = vi.spyOn(BleDirectClient.prototype, 'connectEphemeral').mockResolvedValue(session as any);
    const link = { disconnect: vi.fn(async () => undefined),
      waitForMode: vi.fn(async (_mode: BleApplicationMode, _timeout: number, matcher: (value: any) => Promise<boolean>) => {
        expect(await matcher(target)).toBe(true); return target;
      }) };
    await h.instance.connectUsing(link as any, sourceId);
    expect(authenticated).toHaveBeenCalledOnce(); expect(authenticated.mock.calls[0][0]).toBe(sourceId);
    expect(h.instance.nearbySnapshot(sourceId)).toBe(false); expect(h.instance.nearbySnapshot(aliasId)).toBe(false);
    expect(h.original.confirm).not.toHaveBeenCalled(); expect(h.original.allocate).not.toHaveBeenCalled();
  });
  async function initialSetup() {
    const h = await harness(), controller = new AbortController();
    let confirmed = false;
    const binding = (id: string) => {
      const value = h.binding(id, confirmed);
      for (const key of value.keys) key.version = 1;
      return value;
    };
    h.read.mockImplementation(async id => binding(id));
    const bundle = (deviceConfirmed = false) => ({ logicalDeviceId: sourceId, replayed: true, previous: null,
      current: { accessEpoch: 1, version: 1, key: bytes(16, 3), keyDigest: h.digest.slice(), deviceConfirmed } });
    h.original.sync.mockResolvedValue(bundle());
    h.original.confirm.mockImplementation(async () => { confirmed = true; return bundle(true); });
    const receipt = { encoded: bytes(64, 2), keyDigest: h.digest.slice(), proof: bytes(32, 4) };
    const session = { logicalDeviceId: aliasId, state: 'ready', replacePresenceKey: vi.fn(async () => receipt),
      synchronize: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const intent: any = { state: 'committed', device: { logicalDeviceId: aliasId, state: 'active' },
      sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: aliasId, rootBindingId: reference().rootBindingId,
      bindingRevision: 1, expectedRoot: h.binding(sourceId).expectedRoot };
    const internal = h.instance as any;
    const run = () => internal.initializeRegistrationPresence(intent, session, internal.accountContext(),
      () => { controller.signal.throwIfAborted(); }, controller.signal);
    return { ...h, controller, bundle, session, intent, receipt, run };
  }
  it('uses the fresh target channel once but allocates and confirms only for the original Cloud writer', async () => {
    const h = await initialSetup(), scan = vi.spyOn(bleScanner, 'run');
    h.original.sync.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 404,
      code: 'DEVICE_V2_PRESENCE_NOT_FOUND', message: 'No material' }));
    h.original.allocate.mockResolvedValueOnce(h.bundle());
    await h.run();
    expect(h.read.mock.calls.map(call => call[0])).toEqual([sourceId, sourceId, aliasId]);
    expect(h.original.sync).toHaveBeenCalledExactlyOnceWith(sourceId);
    expect(h.original.allocate).toHaveBeenCalledOnce(); expect(h.original.allocate.mock.calls[0][0]).toBe(sourceId);
    expect(h.session.replacePresenceKey).toHaveBeenCalledOnce();
    expect(h.session.replacePresenceKey.mock.calls[0].slice(0, 3)).toEqual([1, 0, 1]);
    expect(h.original.confirm).toHaveBeenCalledExactlyOnceWith(sourceId, h.receipt.encoded);
    expect((await h.store.load(sourceId))?.presenceBinding?.canWritePresence).toBe(true);
    expect((await h.store.load(aliasId))?.presenceBinding?.canWritePresence).toBe(false);
    expect((await h.store.load(aliasId))?.presenceKeys?.[0].version).toBe(1);
    expect((await h.store.load(sourceId))?.presenceWriteCandidate).toBeUndefined();
    expect(h.session.synchronize).not.toHaveBeenCalled(); expect(scan).not.toHaveBeenCalled();
  });
  it('grants the newly registered card existing confirmed material without rotating or installing', async () => {
    const h = await initialSetup(); h.read.mockImplementation(async id => h.binding(id));
    await h.run();
    expect(h.read.mock.calls.map(call => call[0])).toEqual([sourceId, aliasId]);
    for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
    expect(h.session.replacePresenceKey).not.toHaveBeenCalled();
    expect((await h.store.load(aliasId))?.presenceKeys).toHaveLength(1);
  });
  it.each(['writer', 'revision', 'session', 'retired'] as const)('denies a mismatched %s before any original presence write', async field => {
    const h = await initialSetup();
    if (field === 'writer') h.read.mockImplementation(async id => ({ ...h.binding(id, false), canWritePresence: false }));
    if (field === 'revision') h.intent.bindingRevision++;
    if (field === 'session') h.session.logicalDeviceId = sourceId;
    if (field === 'retired') h.intent.device.state = 'deleted';
    await expect(h.run()).rejects.toThrow();
    for (const method of Object.values(h.original)) expect(method).not.toHaveBeenCalled();
    expect(h.session.replacePresenceKey).not.toHaveBeenCalled();
  });
  it('preserves a writer-only unknown installation candidate without another device write', async () => {
    const h = await initialSetup(); h.session.replacePresenceKey.mockRejectedValueOnce(Error('INSTALL_UNKNOWN'));
    await expect(h.run()).rejects.toThrow('INSTALL_UNKNOWN');
    expect(h.original.sync).toHaveBeenCalledOnce(); expect(h.session.replacePresenceKey).toHaveBeenCalledOnce();
    expect(h.original.confirm).not.toHaveBeenCalled(); expect(h.original.allocate).not.toHaveBeenCalled();
    expect((await h.store.load(sourceId))?.presenceWriteCandidate?.version).toBe(1);
    expect((await h.store.load(aliasId))?.presenceWriteCandidate).toBeUndefined();
    expect((await h.store.load(aliasId))?.presenceKeys).toBeUndefined();
  });
  it('preserves unknown confirmation and clears receipt buffers without retrying confirm', async () => {
    const h = await initialSetup(); h.original.confirm.mockRejectedValueOnce(Error('CONFIRM_UNKNOWN'));
    await expect(h.run()).rejects.toThrow('CONFIRM_UNKNOWN');
    expect(h.session.replacePresenceKey).toHaveBeenCalledOnce(); expect(h.original.confirm).toHaveBeenCalledOnce();
    expect((await h.store.load(sourceId))?.presenceWriteCandidate?.version).toBe(1);
    expect((await h.store.load(aliasId))?.presenceKeys).toBeUndefined();
    expect(h.receipt.keyDigest.every(value => value === 0)).toBe(true);
    expect(h.receipt.proof.every(value => value === 0)).toBe(true);
  });
  it.each(['cancel', 'background', 'account'] as const)('fences %s after key sync before any device mutation', async reason => {
    const h = await initialSetup();
    h.original.sync.mockImplementationOnce(async () => {
      if (reason === 'cancel') h.controller.abort(Error('CANCELLED'));
      else if (reason === 'background') h.active.next(false);
      else h.data.sessionEpoch++;
      return h.bundle();
    });
    await expect(h.run()).rejects.toThrow();
    expect(h.session.replacePresenceKey).not.toHaveBeenCalled(); expect(h.original.confirm).not.toHaveBeenCalled();
    expect(h.original.allocate).not.toHaveBeenCalled();
  });
});
