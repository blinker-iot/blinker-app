import { beforeEach, describe, expect, it, vi } from 'vitest';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  keys: vi.fn(async () => [...values.keys()]), getItem: vi.fn(async (key: string) => values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { values.delete(key); }),
} }));
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { CapacitorBleControllerCredentialStore, BleControllerCredential, bleControllerCredentialChanges } from './credential-store';
import { BleDirectCrypto } from './crypto';
import { base64UrlEncode } from './wire';

const scope = { authority: 'https://fixture.invalid', accountId: 'owner' };
const sourceId = 'device_11111111-1111-4111-8111-111111111111';
const targetId = 'ble_AAECAwQFBgcICQoLDA0ODw';
const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
const source = (): BleControllerCredential => ({ source: 'wifiprov', state: 'active', logicalDeviceId: sourceId,
  deviceInstanceId: bytes(16, 1), accessEpoch: 1, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
  credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 1, locator: base64UrlEncode(bytes(16, 4)) },
  intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array(),
  presenceKeys: [{ state: 'current', accessEpoch: 1, version: 1, key: bytes(16, 5) }] });
async function request() {
  return { sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: targetId,
    rootBindingId: base64UrlEncode(bytes(16, 6)), bindingRevision: 1,
    intentId: base64UrlEncode(bytes(16, 7)), commitId: bytes(16, 8), expectedRoot: {
      deviceInstanceId: base64UrlEncode(bytes(16, 1)), accessEpoch: 1, controllerId: base64UrlEncode(bytes(16, 2)),
      credentialVersion: 1, adminFingerprint: base64UrlEncode(await new BleDirectCrypto().adminFingerprint(bytes(16, 2), bytes(32, 3))),
      cloudCredentialVersion: 1,
    } };
}
describe('explicit shared physical root references', () => {
  beforeEach(() => { values.clear(); vi.clearAllMocks(); });
  it('migrates only an explicit active binding and persists one secret without forging a Bootstrap receipt', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(source());
    await (store as any).prepareAccessRegistrationReference(await request());
    const records = [...values.values()].map(value => JSON.parse(value));
    expect(records.filter(value => value.version === 7)).toHaveLength(2);
    expect(records.filter(value => JSON.stringify(value).includes(base64UrlEncode(bytes(32, 3))))).toHaveLength(1);
    const target = await store.load(targetId);
    expect(target?.state).toBe('pending'); expect(target?.source).toBe('access-registration');
    expect(target?.controllerSecret).toEqual(bytes(32, 3)); expect(target?.receipt).toHaveLength(0);
    expect(target?.presenceKeys).toBeUndefined();
    expect((await store.load(sourceId))?.presenceKeys?.[0]?.key).toEqual(bytes(16, 5));
    await expect(store.findForProvisioning(bytes(16, 1))).rejects.toThrow('AMBIGUOUS');
  });
  it('keeps a pending or active target usable after removing the source card, and clears only final unused root', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(source()); const prepared = await request();
    await (store as any).prepareAccessRegistrationReference(prepared);
    await store.remove(sourceId);
    expect((await store.load(targetId))?.controllerSecret).toEqual(bytes(32, 3));
    await (store as any).confirmAccessRegistrationReference(targetId, prepared.intentId);
    expect((await store.load(targetId))?.state).toBe('active');
    await store.remove(targetId); expect(values.size).toBe(0);
  });
  it('rejects a different existing target or root context without overwriting either credential', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(source()); const prepared = await request();
    const before = [...values.entries()];
    await expect((store as any).prepareAccessRegistrationReference({ ...prepared, expectedRoot: {
      ...prepared.expectedRoot, accessEpoch: 2 } })).rejects.toThrow('CONTEXT');
    expect([...values.entries()]).toEqual(before);
    await store.save({ ...source(), logicalDeviceId: targetId, deviceInstanceId: bytes(16, 9) });
    const occupied = [...values.entries()];
    await expect((store as any).prepareAccessRegistrationReference(prepared)).rejects.toThrow('CONFLICT');
    expect([...values.entries()]).toEqual(occupied);
  });
  it('does not migrate an old pending record or overwrite its UNKNOWN evidence', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save({ ...source(), state: 'pending' }); const before = [...values.entries()];
    await expect((store as any).prepareAccessRegistrationReference(await request())).rejects.toThrow('ACTIVE');
    expect([...values.entries()]).toEqual(before);
  });
  it('recovers a failed second-reference write without losing the original secret or changing root identity', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(source()); const prepared = await request();
    vi.mocked(SecureStorage.setItem).mockImplementation(async (key, value) => {
      if (key.endsWith(targetId)) throw Error('TARGET_WRITE_FAILED'); values.set(key, value);
    });
    await expect((store as any).prepareAccessRegistrationReference(prepared)).rejects.toThrow('TARGET_WRITE_FAILED');
    expect((await store.load(sourceId))?.controllerSecret).toEqual(bytes(32, 3));
    vi.mocked(SecureStorage.setItem).mockImplementation(async (key, value) => { values.set(key, value); });
    await (store as any).prepareAccessRegistrationReference(prepared);
    expect((await store.load(targetId))?.controllerSecret).toEqual(bytes(32, 3));
    expect([...values.values()].filter(value => JSON.parse(value).root?.controllerSecret)).toHaveLength(1);
  });
  it('fences account changes and does not expose a root reference to another scope', async () => {
    let current = scope;
    const store = new CapacitorBleControllerCredentialStore(() => current);
    await store.save(source()); await (store as any).prepareAccessRegistrationReference(await request());
    current = { ...scope, accountId: 'other' };
    await expect(store.load(targetId)).resolves.toBeUndefined();
    expect([...values.values()].filter(value => JSON.parse(value).version === 7)).toHaveLength(2);
  });
  it('does not delete a card when the account changes during its asynchronous read', async () => {
    let current = scope;
    const store = new CapacitorBleControllerCredentialStore(() => current);
    await store.save(source()); await store.prepareAccessRegistrationReference(await request());
    const before = [...values.entries()];
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async key => {
      current = { ...scope, accountId: 'other' }; return values.get(key) ?? null;
    });
    await expect(store.remove(sourceId)).rejects.toThrow('SCOPE_CHANGED');
    expect([...values.entries()]).toEqual(before);
  });
  it('retains unresolved new references and invalidates every reference on a known root change without deleting its secret', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope), prepared = await request();
    await store.save(source()); await store.prepareAccessRegistrationReference(prepared);
    await store.remove(targetId); expect(await store.load(targetId)).toBeDefined();
    const changed: string[] = [];
    const subscription = bleControllerCredentialChanges.subscribe(value => changed.push(value.logicalDeviceId));
    try {
      expect(await (store as any).invalidateRootReferences(prepared.rootBindingId)).toEqual([sourceId, targetId].sort());
      expect(changed.sort()).toEqual([sourceId, targetId].sort());
      await expect(store.load(sourceId)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
      await expect(store.load(targetId)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
      expect([...values.values()].filter(value => JSON.parse(value).root?.controllerSecret)).toHaveLength(1);
      await store.retireAccessRegistrationReference(targetId, prepared.intentId);
      expect(await store.load(targetId)).toBeUndefined();
      await expect(store.load(sourceId)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
    } finally { subscription.unsubscribe(); }
  });
  it('confirmed registration removal retires one active reference even after the shared root became stale', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope), prepared = await request();
    await store.save(source()); await store.prepareAccessRegistrationReference(prepared);
    await store.confirmAccessRegistrationReference(targetId, prepared.intentId);
    await store.invalidateRootReferences(prepared.rootBindingId);
    expect(await (store as any).removeDeletedRegistration(sourceId, bytes(16, 1))).toEqual({ cleanupPending: false });
    expect(await store.load(sourceId)).toBeUndefined();
    await expect(store.load(targetId)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
    expect([...values.values()].filter(value => JSON.parse(value).root?.controllerSecret)).toHaveLength(1);
    expect(await (store as any).removeDeletedRegistration(targetId)).toEqual({ cleanupPending: false });
    expect(values.size).toBe(0);
  });
  it('confirmed registration removal preserves pending references and their only root material', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(source()); await store.prepareAccessRegistrationReference(await request());
    const before = [...values.entries()];
    expect(await (store as any).removeDeletedRegistration(targetId)).toEqual({ cleanupPending: true });
    expect([...values.entries()]).toEqual(before);
  });
  it('confirmed registration removal preserves old pending and key-rotation evidence and fences account changes', async () => {
    let current = scope;
    const store = new CapacitorBleControllerCredentialStore(() => current);
    await store.save({ ...source(), state: 'pending' });
    const pending = [...values.entries()];
    expect(await (store as any).removeDeletedRegistration(sourceId)).toEqual({ cleanupPending: true });
    expect([...values.entries()]).toEqual(pending);
    const rotation = source(); rotation.state = 'pending'; rotation.presenceKeys = undefined;
    rotation.keyRotation = { phase: 'prepared', operationId: base64UrlEncode(bytes(16, 9)),
      previousContext: { ...rotation.cloudContext! } };
    await store.save(rotation); const rotating = [...values.entries()];
    expect(await (store as any).removeDeletedRegistration(sourceId)).toEqual({ cleanupPending: true });
    expect([...values.entries()]).toEqual(rotating);
    await store.save(source());
    const before = [...values.entries()];
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async key => {
      current = { ...scope, accountId: 'other' }; return values.get(key) ?? null;
    });
    await expect((store as any).removeDeletedRegistration(sourceId)).rejects.toThrow('SCOPE_CHANGED');
    expect([...values.entries()]).toEqual(before);
  });
  it('confirmed registration removal checks an allocation instance and does not treat the independent BLE card as WiFiProv', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope);
    await store.save(source()); const prepared = await request(); await store.prepareAccessRegistrationReference(prepared);
    await store.confirmAccessRegistrationReference(targetId, prepared.intentId);
    const before = [...values.entries()];
    await expect(store.removeDeletedRegistration(sourceId, bytes(16, 2))).rejects.toThrow('CONFLICT');
    await expect(store.removeDeletedRegistration(targetId, bytes(16, 1))).rejects.toThrow('CONFLICT');
    expect([...values.entries()]).toEqual(before);
  });
  it('cannot load an active credential carrying an unresolved key rotation as a usable control credential', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => scope), rotation = source();
    rotation.state = 'pending'; rotation.presenceKeys = undefined;
    rotation.keyRotation = { phase: 'prepared', operationId: base64UrlEncode(bytes(16, 9)),
      previousContext: { ...rotation.cloudContext! } };
    await store.save(rotation);
    const [storedKey, encoded] = [...values.entries()][0];
    // Real decoder, deliberately contradictory persisted metadata: never use
    // a caller boolean as evidence that this UNKNOWN became active.
    values.set(storedKey, JSON.stringify({ ...JSON.parse(encoded), state: 'active' }));
    const before = [...values.entries()];
    await expect(store.load(sourceId)).rejects.toThrow('CREDENTIAL_INVALID');
    expect(await store.removeDeletedRegistration(sourceId)).toEqual({ cleanupPending: true });
    expect([...values.entries()]).toEqual(before);
  });
});
