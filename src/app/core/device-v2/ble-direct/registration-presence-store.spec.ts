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
import { AccessRegistrationReferencePreparation } from './access-registration-contract';
import { RegistrationPresenceBinding } from './registration-presence-contract';

const sourceId = 'device_11111111-1111-4111-8111-111111111111', targetId = 'ble_AgICAgICAgICAgICAgICAg';
const scope = { authority: 'https://fixture.invalid', accountId: 'owner' }, bytes = (n: number, b: number) => new Uint8Array(n).fill(b);
const source = (): BleControllerCredential => ({ source: 'wifiprov', state: 'active', logicalDeviceId: sourceId,
  deviceInstanceId: bytes(16, 1), accessEpoch: 1, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
  credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 1, locator: base64UrlEncode(bytes(16, 4)) },
  intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() });
async function harness(active = true) {
  let current = scope;
  const store = new CapacitorBleControllerCredentialStore(() => current);
  const expectedRoot = { deviceInstanceId: base64UrlEncode(bytes(16, 1)), accessEpoch: 1,
    controllerId: base64UrlEncode(bytes(16, 2)), credentialVersion: 1 as const,
    adminFingerprint: base64UrlEncode(await new BleDirectCrypto().adminFingerprint(bytes(16, 2), bytes(32, 3))), cloudCredentialVersion: 1 };
  const prepared: AccessRegistrationReferencePreparation = { sourceLogicalDeviceId: sourceId, targetLogicalDeviceId: targetId,
    rootBindingId: base64UrlEncode(bytes(16, 6)), bindingRevision: 1, intentId: base64UrlEncode(bytes(16, 7)),
    commitId: bytes(16, 8), expectedRoot };
  await store.save(source()); await store.prepareAccessRegistrationReference(prepared);
  if (active) await store.confirmAccessRegistrationReference(targetId, prepared.intentId);
  const key = base64UrlEncode(bytes(16, 9)), keyDigest = base64UrlEncode(await new BleDirectCrypto().sha256(bytes(16, 9)));
  const binding: RegistrationPresenceBinding = { contract: 'access-registration-presence-v1', logicalDeviceId: targetId,
    rootBindingId: prepared.rootBindingId, bindingRevision: 1, expectedRoot, materialOwnerLogicalDeviceId: sourceId,
    canWritePresence: false, keys: [{ state: 'current', accessEpoch: 1, version: 1, key, keyDigest }] };
  return { store, binding, prepared, changeScope: () => { current = { ...scope, accountId: 'other' }; } };
}

describe('explicit shared registration presence storage', () => {
  beforeEach(() => {
    values.clear(); vi.clearAllMocks();
    vi.mocked(SecureStorage.getItem).mockImplementation(async key => values.get(key) ?? null);
    vi.mocked(SecureStorage.setItem).mockImplementation(async (key, value) => { values.set(key, value); });
  });
  it('authorizes only the requested confirmed card and keeps one copy of key material', async () => {
    const f = await harness();
    await (f.store as any).applyRegistrationPresence(f.binding);
    const target = await f.store.load(targetId), original = await f.store.load(sourceId);
    expect(target?.presenceKeys?.[0].key).toEqual(bytes(16, 9)); expect(target?.presenceBinding?.canWritePresence).toBe(false);
    expect(original?.presenceKeys).toBeUndefined();
    expect([...values.values()].filter(value => value.includes(f.binding.keys[0].key))).toHaveLength(1);
    for (const value of values.values()) if (JSON.parse(value).version === 7) expect(value).not.toContain(f.binding.keys[0].key);
  });
  it('keeps target material available after source deletion but not after root invalidation', async () => {
    const f = await harness(); await (f.store as any).applyRegistrationPresence(f.binding);
    await f.store.removeDeletedRegistration(sourceId);
    expect((await f.store.load(targetId))?.presenceKeys?.[0].version).toBe(1);
    await f.store.invalidateRootReferences(f.binding.rootBindingId);
    await expect((f.store as any).applyRegistrationPresence(f.binding)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
  });
  it('does not activate pending references or guess missing old root CAS metadata', async () => {
    const f = await harness(false), before = [...values.entries()];
    await expect((f.store as any).applyRegistrationPresence(f.binding)).rejects.toThrow();
    expect([...values.entries()]).toEqual(before);
    await f.store.confirmAccessRegistrationReference(targetId, f.prepared.intentId);
    const rootKey = [...values.keys()].find(key => key.includes('ble_root_'))!;
    const root = JSON.parse(values.get(rootKey)!); delete root.registrationRoot; values.set(rootKey, JSON.stringify(root));
    await expect((f.store as any).applyRegistrationPresence(f.binding)).rejects.toThrow('CONTEXT_REQUIRED');
  });
  it('rejects root/version/digest substitution without touching either reference', async () => {
    const f = await harness();
    for (const change of [{ bindingRevision: 2 }, { expectedRoot: { ...f.binding.expectedRoot, cloudCredentialVersion: 2 } },
      { keys: [{ ...f.binding.keys[0], keyDigest: base64UrlEncode(bytes(32, 13)) }] }]) {
      const before = [...values.entries()];
      await expect((f.store as any).applyRegistrationPresence({ ...f.binding, ...change })).rejects.toThrow();
      expect([...values.entries()]).toEqual(before);
    }
  });
  it('updates one root and notifies every explicitly authorized reference while rejecting same-version replacement', async () => {
    const f = await harness(); await (f.store as any).applyRegistrationPresence(f.binding);
    await (f.store as any).applyRegistrationPresence({ ...f.binding, logicalDeviceId: sourceId, canWritePresence: true });
    const seen: string[] = [], sub = bleControllerCredentialChanges.subscribe(value => seen.push(value.logicalDeviceId));
    const changed = { state: 'current', accessEpoch: 1, version: 2, key: bytes(16, 10) };
    await (f.store as any).replaceRegistrationPresenceKeys(sourceId, [changed]); sub.unsubscribe();
    expect(new Set(seen)).toEqual(new Set([sourceId, targetId]));
    expect((await f.store.load(targetId))?.presenceKeys?.[0].key).toEqual(bytes(16, 10));
    await expect((f.store as any).replaceRegistrationPresenceKeys(targetId, [changed])).rejects.toThrow('WRITE');
    await expect((f.store as any).replaceRegistrationPresenceKeys(sourceId, [{ ...changed, key: bytes(16, 11) }])).rejects.toThrow('VERSION');
  });
  it('fences a scope replacement during digest verification before secure storage mutation', async () => {
    const f = await harness(), before = [...values.entries()];
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async key => { f.changeScope(); return values.get(key) ?? null; });
    await expect((f.store as any).applyRegistrationPresence(f.binding)).rejects.toThrow('SCOPE_CHANGED');
    expect([...values.entries()]).toEqual(before);
  });
  it('keeps an unconfirmed candidate only for its writer and clears it only after exact device confirmation', async () => {
    const f = await harness();
    await (f.store as any).applyRegistrationPresence({ ...f.binding, logicalDeviceId: sourceId, canWritePresence: true, keys: [] });
    await (f.store as any).applyRegistrationPresence({ ...f.binding, keys: [] });
    const candidate = { state: 'current', accessEpoch: 1, version: 1, key: bytes(16, 9) };
    await (f.store as any).saveRegistrationPresenceCandidate(sourceId, candidate);
    expect((await f.store.load(sourceId))?.presenceWriteCandidate?.key).toEqual(candidate.key);
    expect((await f.store.load(targetId))?.presenceWriteCandidate).toBeUndefined();
    expect((await f.store.load(targetId))?.presenceKeys).toBeUndefined();
    await (f.store as any).applyRegistrationPresence({ ...f.binding, keys: [] });
    expect((await f.store.load(sourceId))?.presenceWriteCandidate?.version).toBe(1);
    await (f.store as any).applyRegistrationPresence(f.binding);
    expect((await f.store.load(sourceId))?.presenceWriteCandidate).toBeUndefined();
    expect((await f.store.load(targetId))?.presenceKeys?.[0].version).toBe(1);
    expect([...values.values()].filter(value => value.includes(f.binding.keys[0].key))).toHaveLength(1);
  });
  it('retains a newer unknown candidate across an older previous-only confirmed read and rejects alias writes', async () => {
    const f = await harness();
    await (f.store as any).applyRegistrationPresence({ ...f.binding, logicalDeviceId: sourceId, canWritePresence: true });
    await (f.store as any).applyRegistrationPresence(f.binding);
    const candidate = { state: 'current', accessEpoch: 1, version: 2, key: bytes(16, 10) };
    await (f.store as any).saveRegistrationPresenceCandidate(sourceId, candidate);
    await expect((f.store as any).saveRegistrationPresenceCandidate(targetId, candidate)).rejects.toThrow('WRITE');
    await (f.store as any).applyRegistrationPresence({ ...f.binding, keys: [{ ...f.binding.keys[0], state: 'previous' }] });
    expect((await f.store.load(sourceId))?.presenceWriteCandidate?.version).toBe(2);
    expect((await f.store.load(targetId))?.presenceKeys?.[0].state).toBe('previous');
    await expect((f.store as any).replaceRegistrationPresenceKeys(sourceId, [{ ...candidate, key: bytes(16, 11) }])).rejects.toThrow('VERSION');
    expect((await f.store.load(sourceId))?.presenceWriteCandidate?.key).toEqual(candidate.key);
  });
  it('retires old observations before a partial secure-write failure and never grants the failed target', async () => {
    const f = await harness();
    await (f.store as any).applyRegistrationPresence({ ...f.binding, logicalDeviceId: sourceId, canWritePresence: true });
    const seen: string[] = [], sub = bleControllerCredentialChanges.subscribe(value => seen.push(value.logicalDeviceId));
    vi.mocked(SecureStorage.setItem).mockImplementation(async (key, value) => {
      if (key.endsWith(targetId)) throw Error('SYNTHETIC_CARD_WRITE_FAILED'); values.set(key, value);
    });
    await expect((f.store as any).applyRegistrationPresence(f.binding)).rejects.toThrow('CARD_WRITE_FAILED'); sub.unsubscribe();
    expect(seen).toContain(sourceId);
    expect((await f.store.load(targetId))?.presenceBinding).toBeUndefined();
    expect((await f.store.load(targetId))?.presenceKeys).toBeUndefined();
  });
  it('keeps an identical authenticated binding read inert instead of aborting its next nearby scan', async () => {
    const f = await harness(); await (f.store as any).applyRegistrationPresence(f.binding);
    const seen: string[] = [], sub = bleControllerCredentialChanges.subscribe(value => seen.push(value.logicalDeviceId));
    vi.mocked(SecureStorage.setItem).mockClear();
    expect(await (f.store as any).applyRegistrationPresence(f.binding)).toEqual([]); sub.unsubscribe();
    expect(SecureStorage.setItem).not.toHaveBeenCalled(); expect(seen).toEqual([]);
  });
});
