import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Bbp2MessageKind, Bbp2FrameFlag, CborReader, encodeFrame,
  encodeCanonicalMap as map, encodeCanonicalUnsigned as u, encodeCanonicalByteString as b,
  encodeCanonicalArray as array } from '../../protocol/device-v2';
import { BleDirectClient } from './client';
import { BleDirectCrypto, controllerAuthProof } from './crypto';
import { BleApplicationMode, base64UrlDecode, base64UrlEncode } from './wire';
import { accessRegistrationConfirmationDigest } from './access-registration-contract';

const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
async function fixture() {
  const crypto = new BleDirectCrypto(), secret = bytes(32, 3);
  const intent = { intentId: base64UrlEncode(bytes(16, 4)), sourceLogicalDeviceId: 'device_11111111-1111-4111-8111-111111111111',
    targetLogicalDeviceId: 'ble_AAECAwQFBgcICQoLDA0ODw', registrationProduct: 'ble_direct' as const,
    rootBindingId: base64UrlEncode(bytes(16, 5)), bindingRevision: 1, clientNonce: base64UrlEncode(bytes(16, 6)),
    expectedRoot: { deviceInstanceId: base64UrlEncode(bytes(16, 1)), accessEpoch: 1, controllerId: base64UrlEncode(bytes(16, 2)),
      credentialVersion: 1 as const, adminFingerprint: base64UrlEncode(await crypto.adminFingerprint(bytes(16, 2), secret)),
      cloudCredentialVersion: 1 }, expiresAt: Date.now() + 120000, state: 'prepared' as const,
    quotaState: 'reserved' as const, replayed: false };
  const credential = { source: 'wifiprov', state: 'active', logicalDeviceId: intent.sourceLogicalDeviceId,
    deviceInstanceId: bytes(16, 1), accessEpoch: 1, controllerId: bytes(16, 2), controllerSecret: secret.slice(),
    credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 1, locator: base64UrlEncode(bytes(16, 7)) },
    intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() };
  const frames: Uint8Array[] = [];
  let count = 0, context: any;
  const response = (kind: Bbp2MessageKind, sequence: number, body: Uint8Array) =>
    encodeFrame({ kind, sequence, body, flags: Bbp2FrameFlag.IsResponse });
  const link = { connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    finishBootstrap: vi.fn(), sendRecord: vi.fn(async (value: Uint8Array) => { frames.push(value); }),
    receiveRecord: vi.fn(async () => {
      count++;
      if (count === 1) return response(Bbp2MessageKind.Hello, 1,
        map([[0, u(0)], [1, array([u(2)])], [2, u(0x22e3)], [3, u(512)], [4, u(512)], [8, array([u(2)])], [9, u(4)]]));
      if (count === 2) {
        const { decodeFrame } = await import('../../protocol/device-v2');
        const reader = new CborReader(decodeFrame(frames[1]).body);
        reader.readMapSize(2); reader.readUnsigned(); reader.readUnsigned(); reader.readUnsigned();
        const payload = reader.readBytes(64);
        context = { controllerId: bytes(16, 2), domain: 2, accessEpoch: 1, credentialVersion: 1,
          permissions: 15, clientNonce: payload.slice(26), deviceNonce: bytes(16, 8) };
        const challenge = new Uint8Array(53); challenge[0] = 0x81; challenge.set(context.deviceNonce, 1);
        new DataView(challenge.buffer).setUint32(17, 15, false);
        challenge.set(await controllerAuthProof(crypto, secret, context, 'device'), 21);
        return response(Bbp2MessageKind.AuthResult, 2, map([[0, u(2)], [1, u(0)], [2, b(challenge)]]));
      }
      return response(Bbp2MessageKind.AuthResult, 3, map([[0, u(2)], [1, u(1)]]));
    }) };
  const store = { load: vi.fn(async () => credential) };
  const client = new BleDirectClient(link as any, {} as any, store as any, crypto);
  return { client, intent, link, frames, crypto, store, credential,
    context: () => context, target: { profile: { mode: BleApplicationMode.Direct } } as any };
}
describe('cross-product purpose-specific Method 2 confirmation', () => {
  it('matches the Gateway shared canonical JSON-array confirmation fixture without treating its digest as attestation', async () => {
    const shared = JSON.parse(readFileSync(new URL('./test-fixtures/access-registration-confirmation-v1.json', import.meta.url), 'utf8'));
    const gatewayPath = resolve(process.cwd(), '../aily-blinker-services/services/gateway/test-fixtures/access-registration-confirmation-v1.json');
    // Keep App-only checkouts independently testable; when both consumers are
    // present, also prove the public metadata vector is byte-for-byte equal.
    if (existsSync(gatewayPath)) expect(shared).toEqual(JSON.parse(readFileSync(gatewayPath, 'utf8')));
    const crypto = new BleDirectCrypto(), original = crypto.sha256.bind(crypto);
    vi.spyOn(crypto, 'sha256').mockImplementationOnce(async () => base64UrlDecode(shared.authTranscriptDigest, 32))
      .mockImplementation(original);
    const intent = { ...shared.intent, expiresAt: Date.now() + 120000, state: 'prepared', quotaState: 'reserved', replayed: false };
    expect(await accessRegistrationConfirmationDigest(crypto, intent, {
      domain: 2, controllerId: base64UrlDecode(intent.expectedRoot.controllerId, 16),
      accessEpoch: intent.expectedRoot.accessEpoch, credentialVersion: 1, permissions: 15,
      clientNonce: base64UrlDecode(intent.clientNonce, 16), deviceNonce: bytes(16, 8),
    })).toBe(shared.expected);
  });
  it('uses the service nonce in a real fresh Method 2 and computes the frozen correlation digest', async () => {
    const f = await fixture();
    const result = await (f.client as any).authenticateAccessRegistration(f.intent, f.target, () => undefined, new AbortController().signal);
    expect(f.link.connect).toHaveBeenCalledOnce(); expect(f.frames).toHaveLength(3);
    expect(base64UrlEncode(f.context().clientNonce)).toBe(f.intent.clientNonce);
    expect(result.confirmationDigest).toBe(await accessRegistrationConfirmationDigest(f.crypto, f.intent, f.context()));
    expect(f.credential.controllerSecret.every(value => value === 0)).toBe(true);
    await result.session.close();
  });
  it('checks cancellation before loading credentials or acquiring the native link', async () => {
    const f = await fixture(), abort = new AbortController(); abort.abort();
    await expect((f.client as any).authenticateAccessRegistration(f.intent, f.target, () => undefined, abort.signal)).rejects.toThrow();
    expect(f.store.load).not.toHaveBeenCalled(); expect(f.link.connect).not.toHaveBeenCalled();
  });
  it('closes a late authenticated link when account ownership changes before returning confirmation', async () => {
    const f = await fixture(); let current = true;
    f.link.receiveRecord.mockImplementationOnce(async () => { current = false; throw Error('fixture cancelled'); });
    await expect((f.client as any).authenticateAccessRegistration(f.intent, f.target, () => {
      if (!current) throw Error('ACCOUNT_CHANGED');
    }, new AbortController().signal)).rejects.toThrow();
    expect(f.link.disconnect).toHaveBeenCalled();
  });
});
