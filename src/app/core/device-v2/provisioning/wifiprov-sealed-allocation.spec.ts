import { createCipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { base64UrlEncode } from '../base64url';
import { openWiFiProvInstallTransfer } from './wifiprov-install-transfer';
import { createFreshSealed, reconcileSealedInstallation } from './wifiprov-sealed-allocation';
import type { WiFiProvSealedInstallation } from './wifiprov-sealed-installation-contract';

const deviceInstance = new Uint8Array(16).fill(1), name = 'Fixture device';
const requestId = 'wifiprov-' + '13'.repeat(16);
const syntheticKey = Buffer.alloc(32, 4);
const locator = createHash('sha256').update('blinker/device-key/locator/v1\0').update(syntheticKey).digest().subarray(0, 16).toString('base64url');
const context = { logicalDeviceId: 'device_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', credentialVersion: 1, locator };
const material = { ...context, deviceKey: syntheticKey.toString('base64url') };
const domain = 'blinker.provisioning-install-key.v1';
const nameDigest = createHash('sha256').update(name).digest('hex');
const region = 'Development' as const;
const instanceId = base64UrlEncode(deviceInstance);
const syntheticRecipient = base64UrlEncode(new Uint8Array(32).fill(12));

// Independent Node-side encryption mirrors the Gateway's narrow X25519/AES
// transfer contract. This exercises real app decryption, not a cleartext stub.
function seal(recipientPublicKey: string, instance = base64UrlEncode(deviceInstance), id = requestId) {
  const recipient = createPublicKey({ type: 'spki', format: 'der',
    key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(recipientPublicKey, 'base64url')]) });
  const sender = generateKeyPairSync('x25519');
  const senderPublicKey = sender.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url');
  const aad = Buffer.from(JSON.stringify([domain, id, instance, context.logicalDeviceId, 1, locator, recipientPublicKey, senderPublicKey]));
  const shared = diffieHellman({ privateKey: sender.privateKey, publicKey: recipient });
  const aes = Buffer.from(hkdfSync('sha256', shared, createHash('sha256').update(aad).digest(), domain, 32));
  const nonce = Buffer.alloc(12, 7), cipher = createCipheriv('aes-256-gcm', aes, nonce);
  try {
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(syntheticKey), cipher.final(), cipher.getAuthTag()]).toString('base64url');
    return { device: { ...context, state: 'active', deviceType: 'diy' }, replayed: false,
      installationTransfer: { contract: 'provisioning-install-key-v1', senderPublicKey, nonce: nonce.toString('base64url'), ciphertext } };
  } finally { shared.fill(0); aes.fill(0); }
}

function fixture() {
  let record: WiFiProvSealedInstallation | undefined;
  let current = true;
  const store = { prepareSealedInstallation: vi.fn(async (_instance: Uint8Array, deviceName: string,
    _region: typeof region): Promise<WiFiProvSealedInstallation> => {
    if (record) throw Error('WIFIPROV_IDENTITY_UNCONFIRMED');
    expect(deviceName).toBe(name);
    return record = { version: 1, requestId, deviceInstanceId: instanceId, nameDigest, phase: 'prepared' };
  }), markSealedCreateDispatched: vi.fn(async (_instance: Uint8Array, id: string, recipientPublicKey: string, _region: typeof region) => {
    if (!record || record.requestId !== id || record.phase !== 'prepared') throw Error('fixture conflict');
    record = { ...record, recipientPublicKey, phase: 'create-dispatched' };
  }), bindSealedInstallation: vi.fn(async (_instance: Uint8Array, id: string, identity: typeof context, _region: typeof region) => {
    if (!record || record.requestId !== id || record.phase !== 'create-dispatched') throw Error('fixture conflict');
    record = { ...record, context: identity, phase: 'card-confirmed' };
  }), loadSealedInstallation: vi.fn(async (_instance: Uint8Array, _region: typeof region) => record) };
  const management = { createDeviceForWiFiProvInstallV2: vi.fn(async (_name: string, id: string, instance: Uint8Array,
    beforeDispatch: (recipient: string) => Promise<void>, _signal?: AbortSignal) =>
    openWiFiProvInstallTransfer(id, base64UrlEncode(instance), async recipient => {
      await beforeDispatch(recipient);
      expect(record?.phase).toBe('create-dispatched');
      return seal(recipient);
    })), readWiFiProvInstallationStatusV2: vi.fn(async () => ({ state: 'created' as const, device: context })),
    createDeviceKeyV2: vi.fn(), revealDeviceKeyV2: vi.fn() };
  const assertCurrent = () => { if (!current) throw Error('account changed'); };
  const create = (instance = deviceInstance) => createFreshSealed(instance, ` ${name} `, store, management, assertCurrent, region);
  return { store, management, create, assertCurrent, record: () => record, retire: () => { current = false; } };
}

describe('fresh-only sealed ordinary WiFiProv allocation', () => {
  it('opens the independently sealed material, binds only public metadata and never uses ordinary create/reveal', async () => {
    const f = fixture();
    await expect(f.create()).resolves.toEqual({ ...material, requestId });
    expect(f.store.prepareSealedInstallation).toHaveBeenCalledExactlyOnceWith(deviceInstance, name, region);
    expect(f.management.createDeviceForWiFiProvInstallV2).toHaveBeenCalledExactlyOnceWith(name, requestId, deviceInstance, expect.any(Function), undefined);
    expect(f.store.bindSealedInstallation).toHaveBeenCalledExactlyOnceWith(deviceInstance, requestId, context, region);
    expect(f.record()).toEqual({ version: 1, nameDigest, requestId, deviceInstanceId: instanceId, context,
      phase: 'card-confirmed', recipientPublicKey: expect.any(String) });
    expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
    await expect(f.create()).rejects.toThrow('IDENTITY_UNCONFIRMED');
    expect(f.management.createDeviceForWiFiProvInstallV2).toHaveBeenCalledTimes(1);
  });

  it('fails before preparation if a dedicated capability is absent', async () => {
    const f = fixture();
    await expect(createFreshSealed(deviceInstance, name, f.store, {} as typeof f.management, f.assertCurrent, region))
      .rejects.toThrow('SEALED_ALLOCATION_UNSUPPORTED');
    await expect(createFreshSealed(deviceInstance, name, { bindSealedInstallation: f.store.bindSealedInstallation } as typeof f.store,
      f.management, f.assertCurrent, region))
      .rejects.toThrow('SEALED_ALLOCATION_UNSUPPORTED');
    expect(f.store.prepareSealedInstallation).not.toHaveBeenCalled(); expect(f.management.createDeviceForWiFiProvInstallV2).not.toHaveBeenCalled();
  });

  it('rejects a record with an existing context even if a nonconforming prepareNew returns it', async () => {
    const f = fixture(); f.store.prepareSealedInstallation.mockResolvedValueOnce({ version: 1, requestId, nameDigest,
      deviceInstanceId: instanceId, phase: 'card-confirmed', recipientPublicKey: syntheticRecipient, context });
    await expect(f.create()).rejects.toThrow('IDENTITY_UNCONFIRMED');
    expect(f.management.createDeviceForWiFiProvInstallV2).not.toHaveBeenCalled(); expect(f.store.bindSealedInstallation).not.toHaveBeenCalled();
  });

  it('never retries a lost CREATE response or an uncertain public context write', async () => {
    for (const failure of ['create', 'bind']) {
      const f = fixture();
      if (failure === 'create') f.management.createDeviceForWiFiProvInstallV2.mockImplementationOnce(async (_name, _id, _instance, dispatch) => {
        await dispatch(syntheticRecipient); throw Error('lost');
      });
      else f.store.bindSealedInstallation.mockRejectedValueOnce(Error('lost'));
      await expect(f.create()).rejects.toThrow('lost');
      expect(f.record()).toMatchObject({ requestId, phase: 'create-dispatched', recipientPublicKey: expect.any(String) });
      await expect(f.create()).rejects.toThrow('IDENTITY_UNCONFIRMED');
      expect(f.management.createDeviceForWiFiProvInstallV2).toHaveBeenCalledTimes(1);
      expect(f.management.createDeviceKeyV2).not.toHaveBeenCalled(); expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
    }
  });

  it('a late successful transfer after account change is not bound', async () => {
    const f = fixture();
    f.management.createDeviceForWiFiProvInstallV2.mockImplementationOnce(async (_name, _id, _instance, dispatch) => {
      await dispatch(syntheticRecipient); f.retire(); return material;
    });
    await expect(f.create()).rejects.toThrow('account changed');
    expect(f.store.bindSealedInstallation).not.toHaveBeenCalled(); expect(f.record()?.phase).toBe('create-dispatched');
  });

  it.each(['instance', 'intent', 'replayed'] as const)('does not bind a transfer for a wrong %s', async wrong => {
    const f = fixture();
    f.management.createDeviceForWiFiProvInstallV2.mockImplementationOnce(async (_name, id, instance, dispatch) =>
      openWiFiProvInstallTransfer(id, base64UrlEncode(instance), async recipient => {
        await dispatch(recipient);
        const reply = seal(recipient, wrong === 'instance' ? base64UrlEncode(new Uint8Array(16).fill(3)) : undefined,
          wrong === 'intent' ? 'wifiprov-' + '22'.repeat(16) : undefined);
        return { ...reply, replayed: wrong === 'replayed' };
      }));
    await expect(f.create()).rejects.toThrow('INSTALL_TRANSFER_INVALID');
    expect(f.store.bindSealedInstallation).not.toHaveBeenCalled(); expect(f.management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('uses the original instance snapshot even if the discovery buffer changes during preparation', async () => {
    const f = fixture(), instance = deviceInstance.slice(), prepare = f.store.prepareSealedInstallation.getMockImplementation()!;
    f.store.prepareSealedInstallation.mockImplementationOnce(async (...args) => { instance.fill(9); args[0].fill(8); return prepare(...args); });
    await expect(f.create(instance)).resolves.toEqual({ ...material, requestId });
    expect(f.management.createDeviceForWiFiProvInstallV2).toHaveBeenCalledExactlyOnceWith(name, requestId, deviceInstance, expect.any(Function), undefined);
    expect(f.store.bindSealedInstallation).toHaveBeenCalledExactlyOnceWith(deviceInstance, requestId, context, region);
  });

  it('awaits confirmed native dispatch storage and does not bind if the HTTP port skipped it', async () => {
    const f = fixture(); f.store.markSealedCreateDispatched.mockRejectedValueOnce(Error('commit failed'));
    await expect(f.create()).rejects.toThrow('commit failed');
    expect(f.store.bindSealedInstallation).not.toHaveBeenCalled(); expect(f.record()?.phase).toBe('prepared');
    const skipped = fixture(); skipped.management.createDeviceForWiFiProvInstallV2.mockResolvedValueOnce(material);
    await expect(skipped.create()).rejects.toThrow('IDENTITY_UNCONFIRMED'); expect(skipped.store.bindSealedInstallation).not.toHaveBeenCalled();
  });

  it('explicit recovery reloads the exact record, sends one public GET and changes no phase or material', async () => {
    const f = fixture(); f.management.createDeviceForWiFiProvInstallV2.mockImplementationOnce(async (_name, _id, _instance, dispatch) => {
      await dispatch(syntheticRecipient); throw Error('lost');
    });
    await expect(f.create()).rejects.toThrow('lost'); const record = f.record()!, signal = new AbortController().signal;
    await expect(reconcileSealedInstallation(record, f.store, f.management, f.assertCurrent, region, signal))
      .resolves.toEqual({ state: 'created', device: context });
    expect(f.management.readWiFiProvInstallationStatusV2).toHaveBeenCalledExactlyOnceWith({
      requestId, nameDigest, deviceInstanceId: instanceId, recipientPublicKey: syntheticRecipient,
    }, signal);
    expect(f.store.bindSealedInstallation).not.toHaveBeenCalled(); expect(f.record()).toBe(record);
    f.store.loadSealedInstallation.mockResolvedValueOnce(undefined);
    await expect(reconcileSealedInstallation(record, f.store, f.management, f.assertCurrent, region, signal)).rejects.toThrow('IDENTITY_UNCONFIRMED');
    expect(f.management.readWiFiProvInstallationStatusV2).toHaveBeenCalledTimes(1);
  });
});
