import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { CapacitorBleControllerCredentialStore, type BleControllerCredential } from './credential-store';
import { BleDirectCrypto } from './crypto';
import { base64UrlEncode } from './wire';

const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  keys: vi.fn(async () => [...values.keys()]), getItem: vi.fn(async (key: string) => values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { values.delete(key); }),
} }));
const account = { authority: 'https://fixture.invalid', accountId: 'owner' };
const cloudId = 'device_11111111-1111-4111-8111-111111111111', bleId = 'ble_AAECAwQFBgcICQoLDA0ODw';
const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);

async function fixture(active = true) {
  let scope = account;
  const store = new CapacitorBleControllerCredentialStore(() => scope);
  const cloud: BleControllerCredential = { source: 'wifiprov', state: 'active', logicalDeviceId: cloudId,
    deviceInstanceId: bytes(16, 1), accessEpoch: 1, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
    credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 1, locator: base64UrlEncode(bytes(16, 4)) },
    intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() };
  await store.save(cloud);
  const intentId = base64UrlEncode(bytes(16, 7));
  await store.prepareAccessRegistrationReference({ sourceLogicalDeviceId: cloudId, targetLogicalDeviceId: bleId,
    rootBindingId: base64UrlEncode(bytes(16, 6)), bindingRevision: 1, intentId, commitId: bytes(16, 8),
    expectedRoot: { deviceInstanceId: base64UrlEncode(bytes(16, 1)), accessEpoch: 1,
      controllerId: base64UrlEncode(bytes(16, 2)), credentialVersion: 1, cloudCredentialVersion: 1,
      adminFingerprint: base64UrlEncode(await new BleDirectCrypto().adminFingerprint(bytes(16, 2), bytes(32, 3))) } });
  if (active) await store.confirmAccessRegistrationReference(bleId, intentId);
  return { store, changeAccount: () => { scope = { ...account, accountId: 'other' }; } };
}

describe('WiFiProv existence is separate from Cloud credential selection', () => {
  beforeEach(() => { values.clear(); vi.clearAllMocks(); });
  it('inspects both active card references without collapsing their IDs or returning any secret', async () => {
    const f = await fixture(), before = [...values.entries()];
    await expect(f.store.inspectForProvisioning(bytes(16, 1))).resolves.toEqual({ hasAny: true, hasUnconfirmed: false });
    await expect(f.store.findForProvisioning(bytes(16, 1))).rejects.toThrow('AMBIGUOUS');
    const selected = await f.store.findWiFiProv(bytes(16, 1));
    expect(selected?.logicalDeviceId).toBe(cloudId); selected?.controllerSecret.fill(0);
    expect([...values.entries()]).toEqual(before);
  });
  it('does not hide a pending target behind the active Cloud reference', async () => {
    const f = await fixture(false), before = [...values.entries()];
    await expect(f.store.inspectForProvisioning(bytes(16, 1))).resolves.toEqual({ hasAny: true, hasUnconfirmed: true });
    expect([...values.entries()]).toEqual(before);
  });
  it('does not read another account or infer a match from a different instance', async () => {
    const f = await fixture();
    await expect(f.store.inspectForProvisioning(bytes(16, 9))).resolves.toEqual({ hasAny: false, hasUnconfirmed: false });
    f.changeAccount();
    await expect(f.store.inspectForProvisioning(bytes(16, 1))).resolves.toEqual({ hasAny: false, hasUnconfirmed: false });
  });
  it('fences account changes before walking returned keys and never writes during inspection', async () => {
    const f = await fixture(), before = [...values.entries()];
    vi.mocked(SecureStorage.keys).mockImplementationOnce(async () => { f.changeAccount(); return [...values.keys()]; });
    await expect(f.store.inspectForProvisioning(bytes(16, 1))).rejects.toThrow('SCOPE_CHANGED');
    expect([...values.entries()]).toEqual(before);
  });
});
