const secureValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    keys: vi.fn(async () => [...secureValues.keys()]),
    getItem: vi.fn(async (key: string) => secureValues.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      secureValues.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      secureValues.delete(key);
    }),
  },
}));

import {
  BleControllerCredential,
  CapacitorBleControllerCredentialStore,
} from './credential-store';
import { base64UrlEncode } from './wire';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

describe('BLE controller credential storage', () => {
  const accountA = { authority: 'https://gateway.test', accountId: 'account-a' };
  const accountB = { authority: 'https://gateway.test', accountId: 'account-b' };

  beforeEach(() => secureValues.clear());

  const wifiPending = (logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111'): BleControllerCredential => ({
    source: 'wifiprov', state: 'pending', logicalDeviceId,
    deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 1,
    controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 15,
    cloudContext: { credentialVersion: 2, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' },
    intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array(),
  });

  const enrollment = (): BleControllerCredential => ({
    ...wifiPending('ble_AAECAwQFBgcICQoLDA0ODw'), source: 'enrollment', cloudContext: undefined,
    intentId: new Uint8Array(16).fill(7), commitId: new Uint8Array(16).fill(8), receipt: new Uint8Array(16).fill(9),
  });

  it('rekey CAS changes only the confirmed Cloud metadata and preserves the original Admin', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => accountA);
    const value = { ...wifiPending(), state: 'active' as const };
    await store.save(value);
    const expected = { deviceInstanceId: base64UrlEncode(value.deviceInstanceId), accessEpoch: value.accessEpoch,
      controllerId: base64UrlEncode(value.controllerId), adminVersion: value.credentialVersion, previous: value.cloudContext! };
    const next = { credentialVersion: 3, locator: base64UrlEncode(new Uint8Array(16).fill(4)) };
    const original = JSON.parse([...secureValues.values()][0]);
    await expect(store.recordWiFiProvRekey(value.logicalDeviceId, { ...expected, adminVersion: 2 }, next, () => {}))
      .rejects.toThrow('REKEY_CONTEXT_CHANGED');
    await store.recordWiFiProvRekey(value.logicalDeviceId, expected, next, () => {});
    const stored = JSON.parse([...secureValues.values()][0]);
    expect(stored).toEqual({ ...original, cloudContext: next });
    await expect(store.recordWiFiProvRekey(value.logicalDeviceId, expected, next, () => {})).rejects.toThrow('REKEY_CONTEXT_CHANGED');
  });

  it('finds legacy active WiFiProv for provisioning without widening WiFiProv recovery filters', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => accountA);
    const value = { ...wifiPending(), state: 'active' as const, cloudContext: undefined };
    await store.save(value); const before = [...secureValues.entries()];
    await expect(store.findWiFiProv(value.deviceInstanceId)).resolves.toBeUndefined();
    await expect(store.findPending(value.deviceInstanceId)).resolves.toBeUndefined();
    const found = await store.findForProvisioning(value.deviceInstanceId);
    expect(found?.logicalDeviceId).toBe(value.logicalDeviceId); expect(found?.state).toBe('active');
    expect(found?.cloudContext).toBeUndefined(); found?.controllerSecret.fill(0);
    expect([...secureValues.entries()]).toEqual(before);
  });

  it('finds enrollment provisioning records only in the same account and rejects an in-flight scope change', async () => {
    let scope = accountA;
    const store = new CapacitorBleControllerCredentialStore(() => scope), value = enrollment();
    await store.save(value); const before = [...secureValues.entries()];
    const found = await store.findForProvisioning(value.deviceInstanceId);
    expect(found?.source).toBe('enrollment'); expect(found?.state).toBe('pending'); found?.controllerSecret.fill(0);
    const pending = await store.findPending(value.deviceInstanceId);
    expect(pending?.logicalDeviceId).toBe(value.logicalDeviceId); pending?.controllerSecret.fill(0);
    await expect(store.findWiFiProv(value.deviceInstanceId)).resolves.toBeUndefined();
    await store.save({ ...value, state: 'active' });
    const active = await store.findForProvisioning(value.deviceInstanceId);
    expect(active?.state).toBe('active'); active?.controllerSecret.fill(0);
    await expect(store.findPending(value.deviceInstanceId)).resolves.toBeUndefined();
    await expect(new CapacitorBleControllerCredentialStore(() => accountB).findForProvisioning(value.deviceInstanceId))
      .resolves.toBeUndefined();
    await expect(new CapacitorBleControllerCredentialStore(() => ({ ...accountA, authority: 'https://other.test' }))
      .findForProvisioning(value.deviceInstanceId)).resolves.toBeUndefined();
    const saved = [...secureValues.entries()];
    vi.mocked(SecureStorage.getItem).mockImplementationOnce(async (key: string) => {
      scope = accountB; return secureValues.get(key) ?? null;
    });
    await expect(store.findForProvisioning(value.deviceInstanceId)).rejects.toThrow('SCOPE_CHANGED');
    expect([...secureValues.entries()]).toEqual(saved); expect(before).toHaveLength(1);
  });

  it('rejects cross-source ambiguity or malformed records without rewriting storage and clears decoded matches', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => accountA), wifi = wifiPending(), enrolled = enrollment();
    await store.save(wifi); await store.save(enrolled); const before = [...secureValues.entries()];
    const wifiMatch = await store.findWiFiProv(wifi.deviceInstanceId), enrollmentMatch = await store.findPending(wifi.deviceInstanceId);
    expect(wifiMatch?.source).toBe('wifiprov'); expect(enrollmentMatch?.source).toBe('enrollment');
    wifiMatch?.controllerSecret.fill(0); enrollmentMatch?.controllerSecret.fill(0);
    const fill = Uint8Array.prototype.fill, cleared: Uint8Array[] = [];
    const spy = vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (this: Uint8Array, value, start, end) {
      const result = fill.call(this, value, start, end);
      if (value === 0 && this.length === 32) cleared.push(this);
      return result;
    });
    try {
      await expect(store.findForProvisioning(wifi.deviceInstanceId)).rejects.toThrow('AMBIGUOUS');
      expect(cleared).toHaveLength(1); expect(cleared[0].every(value => value === 0)).toBe(true);
      expect([...secureValues.entries()]).toEqual(before);
      secureValues.set(before[1][0], 'malformed');
      const malformed = [...secureValues.entries()];
      await expect(store.findForProvisioning(wifi.deviceInstanceId)).rejects.toThrow();
      expect(cleared).toHaveLength(2); expect(cleared[1].every(value => value === 0)).toBe(true);
      expect([...secureValues.entries()]).toEqual(malformed);
    } finally { spy.mockRestore(); }
  });

  it('persists WiFiProv pending before installation, without mixing it into BLE enrollment recovery', async () => {
    const first = new CapacitorBleControllerCredentialStore(() => accountA), value = wifiPending();
    await first.save(value);
    const reopened = new CapacitorBleControllerCredentialStore(() => accountA);
    expect((await reopened.findWiFiProv(value.deviceInstanceId))?.cloudContext).toEqual(value.cloudContext);
    await expect(reopened.findPending(value.deviceInstanceId)).resolves.toBeUndefined();
    await expect(reopened.listPending()).resolves.toEqual([]);
    await expect(new CapacitorBleControllerCredentialStore(() => accountB).findWiFiProv(value.deviceInstanceId))
      .resolves.toBeUndefined();
    await reopened.save({ ...value, state: 'active' });
    expect((await reopened.findWiFiProv(value.deviceInstanceId))?.state).toBe('active');
  });

  it('rejects malformed WiFiProv checkpoints and ambiguous identities', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => accountA), value = wifiPending();
    await expect(store.save({ ...value, cloudContext: undefined })).rejects.toThrow();
    await expect(store.save({ ...value, cloudContext: { credentialVersion: 0, locator: value.cloudContext!.locator } })).rejects.toThrow();
    await expect(store.save({ ...value, cloudContext: { credentialVersion: 1, locator: 'not-a-locator' } })).rejects.toThrow();
    await store.save(value);
    await store.save(wifiPending('device_22222222-2222-4222-8222-222222222222'));
    await expect(store.findWiFiProv(value.deviceInstanceId)).rejects.toThrow('AMBIGUOUS');
    await expect(store.load(value.logicalDeviceId)).resolves.toBeDefined();
  });

  const prepared = (): BleControllerCredential => ({ ...wifiPending(), accessEpoch: 2,
    keyRotation: { phase: 'prepared', operationId: base64UrlEncode(new Uint8Array(16).fill(6)),
      previousContext: { ...wifiPending().cloudContext! },
      expectedAdmin: { accessEpoch: 1, controllerId: base64UrlEncode(new Uint8Array(16).fill(7)) } } });

  it('round-trips schema 6 preparation across storage recreation and keeps it out of BLE claim recovery', async () => {
    const value = prepared();
    await new CapacitorBleControllerCredentialStore(() => accountA).save(value);
    const encoded = [...secureValues.values()][0], raw = JSON.parse(encoded);
    expect(raw.version).toBe(6); expect(raw).not.toHaveProperty('deviceKey');
    const reopened = new CapacitorBleControllerCredentialStore(() => accountA);
    expect((await reopened.findWiFiProv(value.deviceInstanceId, true))?.keyRotation).toEqual(value.keyRotation);
    await expect(reopened.listPending()).resolves.toEqual([]);
    await expect(new CapacitorBleControllerCredentialStore(() => accountB).load(value.logicalDeviceId)).resolves.toBeUndefined();
    const ready = { ...value, keyRotation: { ...value.keyRotation!, phase: 'key-ready' as const },
      cloudContext: { credentialVersion: 3, locator: base64UrlEncode(new Uint8Array(16).fill(8)) } };
    await reopened.save(ready);
    expect((await reopened.load(value.logicalDeviceId))?.cloudContext).toEqual(ready.cloudContext);
    await reopened.save({ ...ready, state: 'active', keyRotation: undefined });
    expect(JSON.parse([...secureValues.values()][0]).version).toBe(5);
    expect((await reopened.load(value.logicalDeviceId))?.keyRotation).toBeUndefined();
  });

  it('does not reinterpret replacement checkpoints as legacy first-install records', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => accountA), value = prepared();
    await store.save(value);
    const [key, encoded] = [...secureValues.entries()][0];
    secureValues.set(key, JSON.stringify({ ...JSON.parse(encoded), version: 5 }));
    await expect(store.load(value.logicalDeviceId)).rejects.toThrow('CORRUPT');
    secureValues.set(key, JSON.stringify({ ...JSON.parse(encoded), keyRotation: undefined }));
    await expect(store.load(value.logicalDeviceId)).rejects.toThrow('CORRUPT');
  });

  it('serializes only the non-secret journal fields, not an accidentally spread reveal response', async () => {
    const value = prepared(), extra = { deviceKey: 'must-not-persist', controllerSecret: 'must-not-persist' };
    await new CapacitorBleControllerCredentialStore(() => accountA).save({ ...value,
      cloudContext: { ...value.cloudContext, ...extra }, keyRotation: { ...value.keyRotation, ...extra,
        previousContext: { ...value.keyRotation!.previousContext, ...extra } } } as any);
    const encoded = [...secureValues.values()][0];
    expect(encoded).not.toContain('must-not-persist');
    expect(JSON.parse(encoded).keyRotation).toEqual(value.keyRotation);
  });

  it('rejects malformed phase/operation/generation, active journals and inherited Presence', async () => {
    const store = new CapacitorBleControllerCredentialStore(() => accountA), value = prepared();
    for (const patch of [{ phase: 'other' }, { operationId: 'bad' },
      { expectedAdmin: { accessEpoch: 0xffffffff, controllerId: value.keyRotation!.expectedAdmin!.controllerId } },
      { expectedAdmin: { accessEpoch: 1, controllerId: base64UrlEncode(value.controllerId) } },
      { previousContext: { credentialVersion: 3, locator: value.cloudContext!.locator } }, { phase: 'key-ready' }]) {
      await expect(store.save({ ...value, keyRotation: { ...value.keyRotation, ...patch } } as any)).rejects.toThrow();
    }
    await expect(store.save({ ...value, state: 'active' })).rejects.toThrow();
    await expect(store.save({ ...value, presenceKeys: [{ state: 'current', version: 1, accessEpoch: 2,
      key: new Uint8Array(16).fill(4) }] })).rejects.toThrow();
    expect(secureValues.size).toBe(0);
  });

  it('persists enrollment PresenceKey with the pending recovery evidence', async () => {
    const logicalDeviceId = 'ble_AAECAwQFBgcICQoLDA0ODw';
    const credential: BleControllerCredential = {
      source: 'enrollment',
      state: 'pending',
      logicalDeviceId,
      deviceInstanceId: new Uint8Array(16).fill(1),
      accessEpoch: 2,
      controllerId: new Uint8Array(16).fill(3),
      controllerSecret: new Uint8Array(32).fill(4),
      credentialVersion: 1,
      permissions: 0x0f,
      presenceKeys: [{
        state: 'current',
        accessEpoch: 2,
        version: 5,
        key: new Uint8Array(16).fill(6),
      }],
      intentId: new Uint8Array(16).fill(7),
      commitId: new Uint8Array(16).fill(8),
      receipt: new Uint8Array(16).fill(9),
    };
    const store = new CapacitorBleControllerCredentialStore(() => accountA);

    await store.save(credential);
    const loaded = await store.load(logicalDeviceId);

    await expect(store.listPending()).resolves.toEqual([logicalDeviceId]);
    expect(loaded?.presenceKeys?.[0]?.version).toBe(5);
    expect(loaded?.presenceKeys?.[0]?.key).toEqual(new Uint8Array(16).fill(6));
    loaded?.controllerSecret.fill(0);
    loaded?.presenceKeys?.[0]?.key.fill(0);
  });

  it('atomically replaces the bounded current and previous PresenceKeys', async () => {
    const logicalDeviceId = 'ble_AAECAwQFBgcICQoLDA0ODw';
    const store = new CapacitorBleControllerCredentialStore(() => accountA);
    await store.save({
      source: 'wifiprov',
      state: 'active',
      logicalDeviceId,
      deviceInstanceId: new Uint8Array(16).fill(1),
      accessEpoch: 7,
      controllerId: new Uint8Array(16).fill(2),
      controllerSecret: new Uint8Array(32).fill(3),
      credentialVersion: 1,
      permissions: 0x0f,
      intentId: new Uint8Array(),
      commitId: new Uint8Array(),
      receipt: new Uint8Array(),
    });

    await store.replacePresenceKeys(logicalDeviceId, [
      { state: 'current', accessEpoch: 7, version: 3, key: new Uint8Array(16).fill(4) },
      { state: 'previous', accessEpoch: 7, version: 2, key: new Uint8Array(16).fill(5) },
    ]);

    const loaded = await store.load(logicalDeviceId);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(loaded?.presenceKeys?.map(value => [value.state, value.version]))
      .toEqual([['current', 3], ['previous', 2]]);
    loaded?.controllerSecret.fill(0);
    for (const value of loaded?.presenceKeys ?? []) value.key.fill(0);
  });

  it('does not expose one account credential to another account or authority', async () => {
    const logicalDeviceId = 'ble_AAECAwQFBgcICQoLDA0ODw';
    const storeA = new CapacitorBleControllerCredentialStore(() => accountA);
    await storeA.save({
      source: 'wifiprov',
      state: 'active',
      logicalDeviceId,
      deviceInstanceId: new Uint8Array(16).fill(1),
      accessEpoch: 7,
      controllerId: new Uint8Array(16).fill(2),
      controllerSecret: new Uint8Array(32).fill(3),
      credentialVersion: 1,
      permissions: 0x0f,
      intentId: new Uint8Array(),
      commitId: new Uint8Array(),
      receipt: new Uint8Array(),
    });

    await expect(new CapacitorBleControllerCredentialStore(() => accountB)
      .load(logicalDeviceId)).resolves.toBeUndefined();
    await expect(new CapacitorBleControllerCredentialStore(() => ({
      authority: 'https://other.test', accountId: accountA.accountId,
    })).load(logicalDeviceId)).resolves.toBeUndefined();
    await expect(storeA.load(logicalDeviceId)).resolves.toBeDefined();
  });
});
