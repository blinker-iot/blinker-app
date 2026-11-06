import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { base64UrlEncode } from '../base64url';
import { WiFiProvSealedInstallationStore, type WiFiProvSealedNativePort } from './wifiprov-sealed-installation-store';
import type { WiFiProvInstallRegion } from './wifiprov-sealed-installation-contract';

const region = 'Development' as const, instance = new Uint8Array(16).fill(1), name = '非公开 设备名';
const recipient = base64UrlEncode(new Uint8Array(32).fill(2));
const context = { logicalDeviceId: 'device_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', credentialVersion: 1,
  locator: base64UrlEncode(new Uint8Array(16).fill(3)) };

function setup() {
  let account = { authority: 'https://example.test', accountId: 'owner', sessionEpoch: 1 };
  let currentRegion: WiFiProvInstallRegion = region, available = true;
  const saved = new Map<string, string>(), legacy = vi.fn(async (_device: Uint8Array) => false);
  const native = {
    read: vi.fn(async ({ scope, instance }: Parameters<WiFiProvSealedNativePort['read']>[0]) => ({ encoded: saved.get(scope + instance) ?? null })),
    list: vi.fn(async ({ scope }: Parameters<WiFiProvSealedNativePort['list']>[0]) =>
      ({ encoded: [...saved].filter(([key]) => key.startsWith(scope)).map(([, value]) => value) })),
    compareAndSet: vi.fn(async ({ scope, instance, expected, encoded }: Parameters<WiFiProvSealedNativePort['compareAndSet']>[0]) => {
      const key = scope + instance;
      if ((saved.get(key) ?? null) !== expected) return { applied: false };
      saved.set(key, encoded);
      return { applied: true };
    }),
  };
  const store = () => new WiFiProvSealedInstallationStore(() => account, legacy, native, () => available, () => currentRegion);
  return { store, native, legacy, saved, setRegion: (value: WiFiProvInstallRegion) => { currentRegion = value; },
    setAccount: (accountId: string) => { account = { ...account, accountId, sessionEpoch: account.sessionEpoch + 1 }; },
    retire: () => { account = { ...account, sessionEpoch: account.sessionEpoch + 1 }; }, unavailable: () => { available = false; } };
}

describe('native sealed allocation companion of the existing store', () => {
  it('preserves original records, strictly advances one phase at a time and hides success without deleting its fence', async () => {
    const f = setup(), store = f.store(), prepared = await store.prepare(instance, name, region);
    const digest = createHash('sha256').update(name).digest('hex');
    expect(prepared).toMatchObject({ phase: 'prepared', nameDigest: digest });
    expect(f.native.compareAndSet.mock.calls[0][0].encoded).not.toContain(name);
    await expect(store.mark(instance, prepared.requestId, region, 'bootstrap-dispatched')).rejects.toThrow('IDENTITY_UNCONFIRMED');
    await store.dispatch(instance, prepared.requestId, recipient, region);
    await expect(store.dispatch(instance, prepared.requestId, recipient, region)).rejects.toThrow('IDENTITY_UNCONFIRMED');
    await store.bind(instance, prepared.requestId, context, region);
    await store.mark(instance, prepared.requestId, region, 'bootstrap-dispatched');
    await store.mark(instance, prepared.requestId, region, 'bootstrap-accepted');
    await store.mark(instance, prepared.requestId, region, 'wifi-dispatched');
    const cold = f.store(); expect(await cold.list(region)).toMatchObject([{ phase: 'wifi-dispatched', context }]);
    await expect(cold.mark(instance, prepared.requestId, region, 'wifi-dispatched')).rejects.toThrow('IDENTITY_UNCONFIRMED');
    await cold.mark(instance, prepared.requestId, region, 'wifi-confirmed');
    expect(await cold.list(region)).toEqual([]);
    expect(await cold.load(instance, region)).toMatchObject({ phase: 'wifi-confirmed', context });
    await expect(cold.prepare(instance, name, region)).rejects.toThrow('IDENTITY_UNCONFIRMED');
    expect(f.saved.size).toBe(1);
  });

  it('fails closed without native durability or if a legacy record exists', async () => {
    const f = setup(); f.legacy.mockResolvedValueOnce(true);
    await expect(f.store().prepare(instance, name, region)).rejects.toThrow('IDENTITY_UNCONFIRMED');
    f.unavailable();
    await expect(f.store().prepare(instance, name, region)).rejects.toThrow('SEALED_DURABILITY_UNAVAILABLE');
    await expect(f.store().list(region)).rejects.toThrow('SEALED_DURABILITY_UNAVAILABLE');
    expect(f.native.compareAndSet).not.toHaveBeenCalled();
  });

  it('never uses an in-process readback as confirmation of a failed synchronous CAS', async () => {
    const f = setup(), store = f.store(), original = f.native.compareAndSet.getMockImplementation()!;
    f.native.compareAndSet.mockImplementationOnce(async options => { await original(options); return { applied: false }; });
    await expect(store.prepare(instance, name, region)).rejects.toThrow('IDENTITY_UNCONFIRMED');
    expect(f.native.read).not.toHaveBeenCalled();
    await expect(store.prepare(instance, name, region)).rejects.toThrow('IDENTITY_UNCONFIRMED');
  });

  it('does not read another account or region and rejects a late read after same-account relogin', async () => {
    const f = setup(), store = f.store(); await store.prepare(instance, name, region);
    f.setAccount('other'); expect(await store.list(region)).toEqual([]);
    f.setAccount('owner'); f.setRegion('Global'); expect(await store.list('Global')).toEqual([]);
    await expect(store.list(region)).rejects.toThrow('SEALED_DURABILITY_UNAVAILABLE');
    f.setRegion(region);
    const previous = f.native.list.getMockImplementation()!;
    f.native.list.mockImplementationOnce(async (...args) => { const result = await previous(...args); f.retire(); return result; });
    await expect(store.list(region)).rejects.toThrow('IDENTITY_UNCONFIRMED');
  });

  it('bounds records and rejects malformed/duplicate entries or leaked fields', async () => {
    const f = setup(), store = f.store(); await store.prepare(instance, name, region);
    const encoded = [...f.saved.values()][0];
    for (const entries of [new Array(33).fill(encoded), [encoded, encoded],
      [JSON.stringify({ ...JSON.parse(encoded), deviceKey: 'synthetic leak' })], [encoded + '\n']]) {
      f.native.list.mockResolvedValueOnce({ encoded: entries });
      await expect(store.list(region)).rejects.toThrow('SEALED_INSTALLATION_INVALID');
    }
  });
});
