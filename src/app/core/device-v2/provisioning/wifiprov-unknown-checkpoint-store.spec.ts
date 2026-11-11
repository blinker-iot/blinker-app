import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ values: new Map<string, string>(), native: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => storage.native } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), keys: vi.fn(),
} }));

import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { CapacitorWiFiProvAllocationStore } from './wifiprov-allocation-store';
import { createWiFiProvUnknownCheckpoint, validateWiFiProvUnknownCheckpoint, wiFiProvUnknownAvailability,
  WIFI_PROV_UNKNOWN_TTL_MS } from './wifiprov-unknown-checkpoint';
import { deviceV2AccountStoragePrefix } from '../account-scope';
import { base64UrlEncode } from '../ble-direct/wire';

const scope = { authority: 'https://gateway.test', accountId: 'original-owner' };
const instance = new Uint8Array(16).fill(1), attemptedAt = 1_800_000_000_000;
const context = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const prefix = value => deviceV2AccountStoragePrefix('blinker_v2_wifiprov_allocation_', value);
const key = (value = instance, owner = scope) => prefix(owner) + base64UrlEncode(value);
const raw = (value = instance) => JSON.parse(storage.values.get(key(value))!);

function fixture() {
  let current = { ...scope }, now = attemptedAt + 1000;
  const store = () => new CapacitorWiFiProvAllocationStore(() => current, () => now);
  const seed = async (value = instance, withUnknown = false) => {
    const record = await store().prepare(value, 'Original name');
    await store().bind(value, record.requestId, context);
    if (withUnknown) {
      const valueRaw = raw(value); valueRaw.record.wifiUnknown = createWiFiProvUnknownCheckpoint(attemptedAt);
      storage.values.set(key(value), JSON.stringify(valueRaw));
    }
  };
  return { store, seed, time: (value: number) => { now = value; },
    account: (value: typeof scope) => { current = value; } };
}

beforeEach(() => {
  vi.clearAllMocks(); storage.values.clear(); storage.native = true;
  vi.mocked(SecureStorage.getItem).mockImplementation(async k => storage.values.get(k) ?? null);
  vi.mocked(SecureStorage.setItem).mockImplementation(async (k, value) => { storage.values.set(k, value as string); });
  vi.mocked(SecureStorage.removeItem).mockImplementation(async k => { storage.values.delete(k); });
  vi.mocked(SecureStorage.keys).mockImplementation(async () => [...storage.values.keys()]);
});

describe('WiFiProv UNKNOWN public checkpoint contract', () => {
  it('has only the exact historical fact and a fixed 24-hour expiry', () => {
    const value = createWiFiProvUnknownCheckpoint(attemptedAt);
    expect(value).toEqual({ version: 1, status: 'unknown', attemptedAt, expiresAt: attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS });
    expect(validateWiFiProvUnknownCheckpoint(value)).toEqual(value);
    expect(wiFiProvUnknownAvailability(value, attemptedAt)).toBe('available');
    expect(wiFiProvUnknownAvailability(value, value.expiresAt - 1)).toBe('available');
    expect(wiFiProvUnknownAvailability(value, value.expiresAt)).toBe('expired');
  });

  it.each([
    { version: 2 }, { status: 'success' }, { attemptedAt: 0 }, { attemptedAt: Number.MAX_SAFE_INTEGER },
    { expiresAt: attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS + 1 }, { password: 'must-not-be-persisted' },
  ])('rejects malformed, widened or secret-bearing checkpoint %j without projection', change => {
    expect(() => validateWiFiProvUnknownCheckpoint({ ...createWiFiProvUnknownCheckpoint(attemptedAt), ...change })).toThrow('CHECKPOINT_INVALID');
  });

  it.each([attemptedAt - 1, NaN, Infinity, 1.5])('fails closed for invalid/rolled-back clock %s without changing expiry', now => {
    const value = createWiFiProvUnknownCheckpoint(attemptedAt), before = { ...value };
    expect(wiFiProvUnknownAvailability(value, now)).toBe('clock-invalid'); expect(value).toEqual(before);
  });
});

describe('WiFiProv UNKNOWN allocation metadata store', () => {
  it('returns no recovery for an old bound allocation and never infers or writes UNKNOWN', async () => {
    const f = fixture(); await f.seed(); const before = [...storage.values.entries()]; vi.clearAllMocks();
    expect(await f.store().listUnknown()).toEqual([]); expect([...storage.values.entries()]).toEqual(before);
    expect(SecureStorage.setItem).not.toHaveBeenCalled(); expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('persists the public fact beside the same request/CAS and reads it on a new store', async () => {
    const f = fixture(); await f.seed(); const previous = raw().record;
    const first = await f.store().saveUnknown(instance, context, attemptedAt);
    expect(first).toMatchObject({ requestId: previous.requestId, name: previous.name, context, deviceInstanceId: instance,
      checkpoint: createWiFiProvUnknownCheckpoint(attemptedAt), availability: 'available' });
    expect(raw().record).toEqual({ ...previous, wifiUnknown: first.checkpoint });
    const encoded = storage.values.get(key())!;
    for (const secret of ['deviceKey', 'controllerSecret', 'password', 'pop', 'sessionEpoch', 'ownerId', 'localOwner']) expect(encoded).not.toContain(secret);
    first.context.credentialVersion = 99; first.deviceInstanceId.fill(9); first.checkpoint.expiresAt++;
    expect((await f.store().listUnknown())[0]).toMatchObject({ context, deviceInstanceId: instance, checkpoint: createWiFiProvUnknownCheckpoint(attemptedAt) });
  });

  it('idempotent save does not renew the original receipt or perform another write', async () => {
    const f = fixture(); await f.seed(); await f.store().saveUnknown(instance, context, attemptedAt);
    const before = [...storage.values.entries()]; vi.clearAllMocks(); f.time(attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS);
    expect((await f.store().saveUnknown(instance, context, attemptedAt)).availability).toBe('expired');
    expect([...storage.values.entries()]).toEqual(before); expect(SecureStorage.setItem).not.toHaveBeenCalled();
    await expect(f.store().saveUnknown(instance, context, attemptedAt + 100)).rejects.toThrow('CONFLICT');
    expect([...storage.values.entries()]).toEqual(before);
  });

  it.each(['missing', 'unbound', 'different-cas'] as const)('rejects %s allocation before storing metadata', async kind => {
    const f = fixture();
    if (kind === 'unbound') await f.store().prepare(instance, 'Original');
    if (kind === 'different-cas') await f.seed();
    const before = [...storage.values.entries()];
    await expect(f.store().saveUnknown(instance, kind === 'different-cas' ? { ...context, credentialVersion: 2 } : context, attemptedAt)).rejects.toThrow('CONFLICT');
    expect([...storage.values.entries()]).toEqual(before);
  });

  it('marks expiry and clock rollback locally without clearing, querying or extending anything', async () => {
    const f = fixture();
    await f.seed(instance, true); const before = [...storage.values.entries()]; vi.clearAllMocks();
    f.time(attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS);
    expect((await f.store().listUnknown())[0].availability).toBe('expired');
    f.time(attemptedAt - 1); expect((await f.store().listUnknown())[0].availability).toBe('clock-invalid');
    expect([...storage.values.entries()]).toEqual(before); expect(SecureStorage.setItem).not.toHaveBeenCalled(); expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('lists only the current account/authority and preserves another account plus unrelated secrets', async () => {
    const f = fixture(); await f.seed(instance, true);
    const otherScope = { ...scope, accountId: 'another-owner' }, other = new CapacitorWiFiProvAllocationStore(() => otherScope, () => attemptedAt);
    const prepared = await other.prepare(instance, 'Other'); await other.bind(instance, prepared.requestId, context); await other.saveUnknown(instance, context, attemptedAt);
    storage.values.set('unrelated-private-entry', 'not-json');
    const before = [...storage.values.entries()];
    expect(await f.store().listUnknown()).toHaveLength(1); f.account({ ...scope, authority: 'https://other.test' });
    expect(await f.store().listUnknown()).toEqual([]); expect([...storage.values.entries()]).toEqual(before);
  });

  it('does not publish results or clear metadata after an account change during native read', async () => {
    const f = fixture(); await f.seed(instance, true); const before = [...storage.values.entries()];
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async k => { f.account({ ...scope, accountId: 'another-owner' }); return storage.values.get(k) ?? null; });
    await expect(f.store().listUnknown()).rejects.toThrow('SCOPE_CHANGED'); expect([...storage.values.entries()]).toEqual(before);
    expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('rejects a concurrent UNKNOWN mutation rather than queuing a second attempt', async () => {
    const f = fixture(); await f.seed(); let release!: () => void;
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(k => new Promise(resolve => { release = () => resolve(storage.values.get(k) ?? null); }));
    const pending = f.store().saveUnknown(instance, context, attemptedAt);
    await expect(f.store().saveUnknown(instance, context, attemptedAt + 1)).rejects.toThrow('BUSY');
    release(); await pending; expect((await f.store().listUnknown())[0].checkpoint.attemptedAt).toBe(attemptedAt);
  });

  it('explicit clear removes only exact metadata and leaves allocation, credentials and original request', async () => {
    const f = fixture(); await f.seed(instance, true); const original = raw().record;
    const credential = 'untouched-controller-record'; storage.values.set('credential', credential);
    const [entry] = await f.store().listUnknown(); await f.store().clearUnknown(entry);
    expect(raw().record).toEqual({ requestId: original.requestId, name: original.name, context: original.context });
    expect(storage.values.get('credential')).toBe(credential); expect(await f.store().listUnknown()).toEqual([]);
    expect(SecureStorage.removeItem).not.toHaveBeenCalled();
    await f.store().clearUnknown(entry); expect(raw().record.requestId).toBe(original.requestId);
  });

  it.each(['request', 'cas', 'time'] as const)('does not let stale %s cleanup erase the current receipt', async changed => {
    const f = fixture(); await f.seed(instance, true); const [entry] = await f.store().listUnknown();
    if (changed === 'request') entry.requestId = 'wifiprov-' + 'f'.repeat(32);
    if (changed === 'cas') entry.context.credentialVersion++;
    if (changed === 'time') entry.checkpoint = createWiFiProvUnknownCheckpoint(attemptedAt + 1);
    const before = [...storage.values.entries()]; await expect(f.store().clearUnknown(entry)).rejects.toThrow('CONFLICT');
    expect([...storage.values.entries()]).toEqual(before);
  });

  it('snapshots exact clear identity before the native await rather than reading mutable caller state later', async () => {
    const f = fixture(); await f.seed(instance, true); const [entry] = await f.store().listUnknown();
    let release!: () => void;
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(k => new Promise(resolve => { release = () => resolve(storage.values.get(k) ?? null); }));
    const work = f.store().clearUnknown(entry);
    entry.requestId = 'wifiprov-' + 'f'.repeat(32); entry.context.credentialVersion++;
    entry.deviceInstanceId.fill(8); entry.checkpoint.attemptedAt++;
    release(); await work;
    expect(raw().record.wifiUnknown).toBeUndefined(); expect(raw().record.context).toEqual(context);
  });

  it('does not lose metadata when native save or precise clear fails', async () => {
    const f = fixture(); await f.seed(); const original = [...storage.values.entries()];
    vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(Error('storage unavailable'));
    await expect(f.store().saveUnknown(instance, context, attemptedAt)).rejects.toThrow('storage unavailable'); expect([...storage.values.entries()]).toEqual(original);
    await f.store().saveUnknown(instance, context, attemptedAt); const withUnknown = [...storage.values.entries()], [entry] = await f.store().listUnknown();
    vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(Error('storage unavailable'));
    await expect(f.store().clearUnknown(entry)).rejects.toThrow('storage unavailable'); expect([...storage.values.entries()]).toEqual(withUnknown);
  });

  it.each(['extra-record', 'extra-context', 'extra-envelope', 'oversized', 'bad-checkpoint'] as const)('rejects %s without repairing or deleting original data', async changed => {
    const f = fixture(); await f.seed(); const value = raw();
    if (changed === 'extra-record') value.record.password = 'not-allowed';
    if (changed === 'extra-context') value.record.context.secret = 'not-allowed';
    if (changed === 'extra-envelope') value.secret = 'not-allowed';
    if (changed === 'oversized') value.record.padding = 'x'.repeat(5000);
    if (changed === 'bad-checkpoint') value.record.wifiUnknown = { ...createWiFiProvUnknownCheckpoint(attemptedAt), expiresAt: 1 };
    storage.values.set(key(), JSON.stringify(value)); const before = [...storage.values.entries()];
    await expect(f.store().saveUnknown(instance, context, attemptedAt)).rejects.toThrow();
    await expect(f.store().listUnknown()).rejects.toThrow(); expect([...storage.values.entries()]).toEqual(before);
    expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('rejects global and per-scope enumeration overflow without touching any record', async () => {
    const f = fixture(); await f.seed(instance, true); const before = [...storage.values.entries()];
    vi.mocked(SecureStorage.keys).mockResolvedValueOnce(Array.from({ length: 2049 }, (_, n) => 'unrelated-' + n));
    await expect(f.store().listUnknown()).rejects.toThrow('LIMIT');
    vi.mocked(SecureStorage.keys).mockResolvedValueOnce(Array.from({ length: 33 }, (_, n) => prefix(scope) + String(n)));
    await expect(f.store().listUnknown()).rejects.toThrow('LIMIT'); expect([...storage.values.entries()]).toEqual(before);
  });

  it('caps stored recovery metadata at eight, including expired receipts, without eviction', async () => {
    const f = fixture(); for (let n = 1; n <= 9; n++) await f.seed(new Uint8Array(16).fill(n), n <= 8);
    f.time(attemptedAt + WIFI_PROV_UNKNOWN_TTL_MS); const before = [...storage.values.entries()];
    expect(await f.store().listUnknown()).toHaveLength(8);
    await expect(f.store().saveUnknown(new Uint8Array(16).fill(9), context, attemptedAt)).rejects.toThrow('LIMIT');
    expect([...storage.values.entries()]).toEqual(before);
    const ninth = raw(new Uint8Array(16).fill(9)); ninth.record.wifiUnknown = createWiFiProvUnknownCheckpoint(attemptedAt);
    storage.values.set(key(new Uint8Array(16).fill(9)), JSON.stringify(ninth));
    await expect(f.store().listUnknown()).rejects.toThrow('LIMIT'); expect(SecureStorage.removeItem).not.toHaveBeenCalled();
  });

  it('uses the existing exact complete operation for normal allocation retirement', async () => {
    const f = fixture(); await f.seed(instance, true); await f.store().complete(instance, context.logicalDeviceId);
    expect(storage.values.has(key())).toBe(false); expect(await f.store().listUnknown()).toEqual([]);
  });

  it('has no browser storage fallback and rejects an invalid instance', async () => {
    const f = fixture(); storage.native = false;
    expect(await f.store().listUnknown()).toEqual([]); expect(SecureStorage.keys).not.toHaveBeenCalled();
    await expect(f.store().saveUnknown(instance, context, attemptedAt)).rejects.toThrow('SECURE_STORAGE_REQUIRED');
    storage.native = true; await expect(f.store().saveUnknown(new Uint8Array(16), context, attemptedAt)).rejects.toThrow('INSTANCE_INVALID');
  });
});
