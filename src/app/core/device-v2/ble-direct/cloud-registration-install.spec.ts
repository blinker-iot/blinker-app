import { createCipheriv, createDecipheriv, createHash, hkdfSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encodeDirectAppHelloBody } from '../../protocol/device-v2/direct-hello';
import { Bbp2FrameFlag, Bbp2MessageKind, CborReader, decodeFrame, encodeFrame, encodeTimeRequest,
  encodeCanonicalMap as map, encodeCanonicalUnsigned as u, encodeCanonicalByteString as b,
  encodeCanonicalArray as array } from '../../protocol/device-v2';
import { BleDirectClient, InitialCloudRegistrationOwner } from './client';
import { BleDirectCrypto, DirectSecureContext, controllerAuthProof, directAuthTranscript } from './crypto';
import type { BleControllerCredential, BleControllerCredentialStore } from './credential-store';
import type { BleDirectRecordLink, BleDirectTarget } from './transport';
import { BleApplicationMode, base64UrlEncode } from './wire';
import { CLOUD_REGISTRATION_CONTRACT, IssuedCloudRegistration, confirmInitialCloudKeyAck,
  encodeInitialCloudKeyInstall, snapshotIssuedCloudRegistration, verifyIssuedCloudRegistrationKey } from './cloud-registration-wire';
import { deriveInitialCloudWifiCredentials, holdInitialCloudWifiCarrier, InitialCloudWifiCarrierUse } from './cloud-registration-carrier';

const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
const id = (value: number, size = 16) => base64UrlEncode(bytes(size, value));
const sha = (...parts: (string | Uint8Array)[]) => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
};
const ackBody = Buffer.from('8301500101010101010101010101010101010150063f21c532be08683280eabbf47efd90', 'hex');
const response = (kind: Bbp2MessageKind, sequence: number, body: Uint8Array, flags = Bbp2FrameFlag.IsResponse) =>
  encodeFrame({ kind, sequence, body, flags });

function intent(fingerprint = id(4, 32)): IssuedCloudRegistration {
  const scope = ['synthetic-owner', 'synthetic-tenant', id(1), 'synthetic-ble', 'synthetic-cloud'];
  const root = ['ble-no-cloud-key-v2', id(2), 7, id(3), 3, fingerprint, 'absent'];
  const locator = sha('blinker/device-key/locator/v1\0', bytes(32, 6)).subarray(0, 16).toString('base64url');
  const issuanceDigest = sha(JSON.stringify(['blinker.access-registration-cloud.issuance.v2', ...scope, root,
    id(5), 1, locator])).toString('base64url');
  return { contract: CLOUD_REGISTRATION_CONTRACT, ownerUserId: scope[0], tenantId: scope[1], intentId: scope[2],
    sourceLogicalDeviceId: scope[3], targetLogicalDeviceId: scope[4], expectedRoot: { kind: 'ble-no-cloud-key-v2',
      deviceInstanceId: id(2), accessEpoch: 7, controllerId: id(3), credentialVersion: 3, adminFingerprint: fingerprint,
      cloudKey: { state: 'absent' } }, clientNonce: id(5), expiresAt: Date.now() + 120_000, state: 'key_issued',
    targetKey: { credentialVersion: 1, locator, issuanceDigest, issuedAt: Date.now() } };
}

const context = (): DirectSecureContext => ({ domain: 2, controllerId: bytes(16, 3), accessEpoch: 7,
  credentialVersion: 3, permissions: 15, clientNonce: bytes(16, 5), deviceNonce: bytes(16, 9) });

describe('initial Cloud Key wire and exact ACK', () => {
  it('matches the independent BC2 proof, locator and Gateway confirmation vectors', async () => {
    const value = intent(), crypto = new BleDirectCrypto(), key = bytes(32, 6), binding = bytes(16, 8);
    expect(value.targetKey.locator).toBe('Bj8hxTK-CGgygOq79H79kA');
    expect(value.targetKey.issuanceDigest).toBe('psj8flDI6tNxgYi2eiPZSlxLKTD2GXZG7sJQxpYzG4s');
    await verifyIssuedCloudRegistrationKey(crypto, value, key);
    const request = await encodeInitialCloudKeyInstall(crypto, value, context(), binding, bytes(32, 11), key);
    expect(Buffer.from(request).toString('hex')).toBe('840150' + '01'.repeat(16) + '5820' + '06'.repeat(32)
      + '5820ac3b3692ad77d0e4695d85eeb780a70bbdfdf729a665d698b7972dd3400fbbb7');
    const confirmed = await confirmInitialCloudKeyAck(crypto, value, binding, context().deviceNonce, ackBody);
    expect(Buffer.from(confirmed.receipt.ackDigest, 'base64url').toString('hex')).toBe('3c793f77c866db148aebd3ea6312934f9950ed67fe223e3ca8546a98db73b63c');
    expect(confirmed.confirmationDigest).toBe('zE-YlbU7osjCYxhx0t6OI304mS7sTlkB6UKj6Nim1qU');
    request.fill(0);
  });

  it('rejects non-canonical, malformed or unrelated ACK without producing confirmation', async () => {
    const crypto = new BleDirectCrypto(), value = intent();
    const wrongIntent = Uint8Array.from(ackBody); wrongIntent[3] ^= 1;
    const wrongLocator = Uint8Array.from(ackBody); wrongLocator[20] ^= 1;
    for (const payload of [ackBody.subarray(0, 35), Uint8Array.of(...ackBody, 0), wrongIntent, wrongLocator,
      Uint8Array.of(0x83, 0x18, 1, ...ackBody.subarray(2)), Uint8Array.of(0x83, 2, ...ackBody.subarray(2))]) {
      await expect(confirmInitialCloudKeyAck(crypto, value, bytes(16, 8), bytes(16, 9), payload))
        .rejects.toThrow('CLOUD_REGISTRATION_ACK_INVALID');
    }
  });

  it('detaches the issued ledger context and rejects pending or corrupt material', async () => {
    const crypto = new BleDirectCrypto(), value = intent(), copy = snapshotIssuedCloudRegistration(value);
    value.expectedRoot.accessEpoch++; value.targetKey.issuanceDigest = id(13, 32);
    await verifyIssuedCloudRegistrationKey(crypto, copy, bytes(32, 6));
    await expect(verifyIssuedCloudRegistrationKey(crypto, value, bytes(32, 6))).rejects.toThrow('CLOUD_REGISTRATION_CONTEXT_INVALID');
    await expect(verifyIssuedCloudRegistrationKey(crypto, copy, bytes(32, 7))).rejects.toThrow('CLOUD_REGISTRATION_CONTEXT_INVALID');
    expect(() => snapshotIssuedCloudRegistration({ ...copy, state: 'install_unknown' } as never))
      .toThrow('CLOUD_REGISTRATION_CONTEXT_INVALID');
    expect(() => snapshotIssuedCloudRegistration({ ...copy, clientNonce: 'A'.repeat(4096) }))
      .toThrow('CLOUD_REGISTRATION_CONTEXT_INVALID');
    expect(() => snapshotIssuedCloudRegistration({ ...copy, expiresAt: copy.targetKey.issuedAt + 120_001 }))
      .toThrow('CLOUD_REGISTRATION_CONTEXT_INVALID');
  });
});

describe('temporary Cloud carrier credentials', () => {
  it('matches the fixed cross-language vector and separates WPA2 and PoP', async () => {
    const value = intent(), crypto = new BleDirectCrypto();
    const exact = await deriveInitialCloudWifiCredentials(crypto, bytes(32, 11), value, bytes(16, 8));
    try {
      expect(exact.ssid).toBe('BLK-74bc382b85aaf840');
      expect(Buffer.from(exact.passphrase).toString('ascii')).toBe('23ee394de6bad1f536e3d13dafdeba77');
      expect(Buffer.from(exact.proofOfPossession).toString('ascii')).toBe('59723ae943c16b76dafa58bf0316799f');
      const another = await deriveInitialCloudWifiCredentials(crypto, bytes(32, 11), value, bytes(16, 9));
      try {
        expect(another.ssid).not.toBe(exact.ssid);
        expect(another.passphrase).not.toEqual(exact.passphrase);
        expect(another.proofOfPossession).not.toEqual(exact.proofOfPossession);
      } finally { another.passphrase.fill(0); another.proofOfPossession.fill(0); }
    } finally { exact.passphrase.fill(0); exact.proofOfPossession.fill(0); }
  });

  it('wipes expired pending and in-use credentials without waiting for the consumer', async () => {
    const owner = new AbortController();
    const credential = () => ({ ssid: 'BLK-synthetic', passphrase: bytes(32, 31), proofOfPossession: bytes(32, 29) });
    vi.useFakeTimers();
    try {
      const pending = credential(), inUse = credential(), expiresAt = Date.now() + 100;
      const waiting = holdInitialCloudWifiCarrier(pending, expiresAt, owner.signal, () => undefined);
      const active = holdInitialCloudWifiCarrier(inUse, expiresAt, owner.signal, () => undefined);
      const consumer = vi.fn(() => new Promise<void>(() => undefined));
      const result = expect(active.use(consumer)).rejects.toThrow('CLOUD_REGISTRATION_CARRIER_RETIRED');
      expect(consumer).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100); await result;
      for (const material of [pending, inUse]) {
        expect(material.passphrase).toEqual(new Uint8Array(32));
        expect(material.proofOfPossession).toEqual(new Uint8Array(32));
      }
      await expect(waiting.use(consumer)).rejects.toThrow('CLOUD_REGISTRATION_CARRIER_RETIRED');
      expect(consumer).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});

// Independent Node AES-GCM peer over the normal App Method2 and Direct channel.
// Only link/ledger/store ports are synthetic; no device/radio/HTTP is opened.
async function fixture() {
  const crypto = new BleDirectCrypto(), secret = bytes(32, 11), key = bytes(32, 6);
  const value = intent(base64UrlEncode(await crypto.adminFingerprint(bytes(16, 3), secret, 3)));
  const credential: BleControllerCredential = { source: 'enrollment', state: 'active', logicalDeviceId: value.sourceLogicalDeviceId,
    deviceInstanceId: bytes(16, 2), controllerId: bytes(16, 3), controllerSecret: secret.slice(),
    accessEpoch: 7, credentialVersion: 3, permissions: 15, intentId: bytes(16, 1), commitId: bytes(16, 2), receipt: bytes(8, 3) };
  const target: BleDirectTarget = { device: { deviceId: 'synthetic-link' }, profile: { mode: BleApplicationMode.Direct,
    wireVersion: 2, capabilities: 17, modeLocator: new Uint8Array(8) } };
  const abort = new AbortController(), current = vi.fn(), beforeWrite = vi.fn(async () => undefined);
  const owner: InitialCloudRegistrationOwner = { signal: abort.signal, assertCurrent: current, beforeWrite };
  const frames: Uint8Array[] = [], mutations: ReturnType<typeof decodeFrame>[] = [];
  let count = 0, received: DirectSecureContext | undefined, material: Buffer | undefined;
  let next: Uint8Array | undefined, waiting: { resolve(value: Uint8Array): void; reject(error: Error): void } | undefined;
  let sent: () => void = () => undefined;
  const dispatched = new Promise<void>(resolve => { sent = resolve; });
  const options = { drop: false, disconnectFailure: false, sendFailure: false, ack: 'exact', packet: 20 };
  const deviceHello = (packet?: number) => map([[0, u(0)], [1, array([u(2)])], [2, u(0x20)], [3, u(512)],
    [4, u(512)], [8, array([u(2)])], ...(packet === undefined ? [] : [[12, u(packet)]] as [number, Uint8Array][])]);
  const emit = (record: Uint8Array) => {
    if (waiting) { const current = waiting; waiting = undefined; current.resolve(record); }
    else next = record;
  };
  const link = {
    connect: vi.fn(async () => undefined), finishBootstrap: vi.fn(),
    maxPacketSize: vi.fn(async () => options.packet), preparePacketNegotiation: vi.fn(), applyPacketSize: vi.fn(),
    waitForMode: vi.fn(async () => { throw Error('unexpected radio handoff'); }),
    disconnect: vi.fn(async () => {
      waiting?.reject(Error('synthetic closed')); waiting = undefined;
      if (options.disconnectFailure) throw Error('BLE_DIRECT_NATIVE_RELEASE_FAILED');
    }),
    sendRecord: vi.fn(async (record: Uint8Array) => {
      if (record[0] === 0x42) { frames.push(record); return; }
      const aad = (direction: number, header: Uint8Array) => Buffer.concat([Buffer.from('BLINKER-DIRECT-RECORD/1'),
        Buffer.of(direction), material!.subarray(80, 96), Buffer.from(header)]);
      const decipher = createDecipheriv('aes-256-gcm', material!.subarray(0, 32),
        Buffer.concat([material!.subarray(64, 72), record.subarray(4, 8)]));
      decipher.setAAD(aad(1, record.subarray(0, 8))); decipher.setAuthTag(record.subarray(-16));
      const request = decodeFrame(Buffer.concat([decipher.update(record.subarray(8, -16)), decipher.final()]));
      const seal = (payload: Uint8Array, sequence: number) => {
        const header = Buffer.of(0xd3, 0x10, 0, payload.length, 0, 0, 0, sequence);
        const cipher = createCipheriv('aes-256-gcm', material!.subarray(32, 64),
          Buffer.concat([material!.subarray(72, 80), header.subarray(4)]));
        cipher.setAAD(aad(2, header));
        return Buffer.concat([header, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
      };
      if (request.kind === Bbp2MessageKind.Hello) {
        expect(request.body).toEqual(encodeDirectAppHelloBody('precloud-controller', 512, false, options.packet));
        emit(Uint8Array.from(seal(response(Bbp2MessageKind.Hello, request.sequence, deviceHello(options.packet)), 0)));
        return;
      }
      mutations.push(request); sent();
      if (options.sendFailure) throw Error('synthetic write outcome unknown');
      if (options.drop || request.kind === Bbp2MessageKind.InitialCloudWifiHandoff) return;
      const body = Uint8Array.from(ackBody);
      if (options.ack === 'locator') body[20] ^= 1;
      const flags = options.ack === 'flags' ? Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode : Bbp2FrameFlag.IsResponse;
      let reply = response(Bbp2MessageKind.InitialCloudKeyReceipt, request.sequence + (options.ack === 'sequence' ? 1 : 0), body, flags);
      if (options.ack === 'header') { reply = Uint8Array.of(...reply.subarray(0, 10), 0, ...reply.subarray(10)); reply[5]++; }
      const counter = options.packet > 20 ? 1 : 0;
      const timeFirst = options.ack === 'time-before-ack';
      if (timeFirst) emit(Uint8Array.from(seal(encodeFrame({ kind: Bbp2MessageKind.TimeRequest, flags: 0,
        sequence: request.sequence + 1, body: encodeTimeRequest(bytes(16, 20)) }), counter)));
      const encrypted = seal(reply, counter + (timeFirst ? 1 : 0));
      if (options.ack === 'session') encrypted[encrypted.length - 1] ^= 1;
      emit(Uint8Array.from(encrypted)); // Native link supplies detached Uint8Array, not Node Buffer views.
    }),
    receiveRecord: vi.fn(async (): Promise<Uint8Array> => {
      count++;
      if (count === 1) return response(Bbp2MessageKind.Hello, 1,
        // Actual PreCloudDirect is Method 2 only, with no ordinary Manifest,
        // State revision, endpoint IDs, reliable window or telemetry.
        deviceHello());
      if (count === 2) {
        const reader = new CborReader(decodeFrame(frames[1]).body);
        reader.readMapSize(2); reader.readUnsigned(); reader.readUnsigned(); reader.readUnsigned();
        const clientNonce = reader.readBytes(64).slice(26);
        received = { ...context(), clientNonce };
        material = Buffer.from(hkdfSync('sha256', secret, sha('BLINKER-DIRECT-AUTH/1', directAuthTranscript(received)),
          'BLINKER-DIRECT-SESSION/1', 96));
        const challenge = new Uint8Array(53); challenge[0] = 0x81; challenge.set(received.deviceNonce, 1);
        new DataView(challenge.buffer).setUint32(17, 15, false);
        challenge.set(await controllerAuthProof(crypto, secret, received, 'device'), 21);
        return response(Bbp2MessageKind.AuthResult, 2, map([[0, u(2)], [1, u(0)], [2, b(challenge)]]));
      }
      if (count === 3) return response(Bbp2MessageKind.AuthResult, 3, map([[0, u(2)], [1, u(1)]]));
      if (next) { const record = next; next = undefined; return record; }
      return new Promise((resolve, reject) => { waiting = { resolve, reject }; });
    }),
  };
  const load = vi.fn(async () => credential);
  const client = new BleDirectClient(link satisfies BleDirectRecordLink, {} as never,
    { load } as unknown as BleControllerCredentialStore, crypto);
  return { crypto, key, value, credential, target, owner, current, beforeWrite, abort, client, link, load,
    mutations, options, dispatched, nativeDrop: () => waiting?.reject(Error('synthetic peer disconnected')),
    received: () => received!, binding: () => material!.subarray(80, 96),
    install: () => client.installInitialCloudRegistrationKey(value, key, target, owner) };
}

describe('explicit initial Cloud registration consumer', () => {
  it('keeps the dedicated Hello contract during the encrypted ATT negotiation before arming the install', async () => {
    const f = await fixture(); f.options.packet = 64;
    const installed = await f.install();
    expect(f.link.applyPacketSize).toHaveBeenCalledExactlyOnceWith(64);
    expect(f.beforeWrite).toHaveBeenCalledOnce();
    expect(f.mutations.map(x => x.kind)).toEqual([Bbp2MessageKind.InitialCloudKeyInstall]);
    await installed.close();
  });

  it('uses fresh Method2, writes once only after the checkpoint, and confirms a late authenticated ACK', async () => {
    const f = await fixture();
    f.beforeWrite.mockImplementationOnce(async () => { expect(f.mutations).toHaveLength(0); });
    const now = vi.spyOn(Date, 'now');
    const actual = f.crypto.sha256.bind(f.crypto);
    const spy = vi.spyOn(f.crypto, 'sha256').mockImplementation((...parts) => {
      if (parts.length === 1 && parts[0].length === 36) now.mockReturnValue(f.value.expiresAt + 1);
      return actual(...parts);
    });
    try {
      const result = await f.install();
      expect(f.beforeWrite).toHaveBeenCalledOnce(); expect(f.link.connect).toHaveBeenCalledOnce();
      expect(base64UrlEncode(f.received().clientNonce)).toBe(f.value.clientNonce);
      expect(f.mutations).toHaveLength(1);
      expect(f.mutations[0].kind).toBe(Bbp2MessageKind.InitialCloudKeyInstall);
      expect(f.mutations[0].flags).toBe(0);
      expect(f.mutations[0].body).toEqual(await encodeInitialCloudKeyInstall(f.crypto, f.value, f.received(),
        f.binding(), bytes(32, 11), f.key));
      expect(result.confirmation.receipt.sessionBinding).toBe(base64UrlEncode(f.binding()));
      expect(result.confirmation.receipt.deviceNonce).toBe(id(9));
      expect(result.confirmation.receipt.ackDigest).toBe(sha(ackBody).toString('base64url'));
      expect(f.credential.controllerSecret).toEqual(new Uint8Array(32));
      expect(f.link.disconnect).not.toHaveBeenCalled();
      expect(f.link.waitForMode).not.toHaveBeenCalled();
      f.options.disconnectFailure = true;
      await expect(result.close()).rejects.toThrow('BLE_DIRECT_NATIVE_RELEASE_FAILED');
    } finally { spy.mockRestore(); now.mockRestore(); }
  });

  it('rejects root or Key mismatch before acquiring the radio', async () => {
    const keyMismatch = await fixture(); keyMismatch.key[0] ^= 1;
    await expect(keyMismatch.install()).rejects.toThrow('CLOUD_REGISTRATION_CONTEXT_INVALID');
    expect(keyMismatch.link.connect).not.toHaveBeenCalled(); expect(keyMismatch.load).not.toHaveBeenCalled();
    const rootMismatch = await fixture(); rootMismatch.credential.credentialVersion = 1;
    await expect(rootMismatch.install()).rejects.toThrow('CLOUD_REGISTRATION_ROOT_CHANGED');
    expect(rootMismatch.link.connect).not.toHaveBeenCalled(); expect(rootMismatch.credential.controllerSecret).toEqual(new Uint8Array(32));
  });

  it('checks original expiry/owner after the checkpoint and again immediately before native dispatch', async () => {
    const expired = await fixture(), now = vi.spyOn(Date, 'now');
    expired.beforeWrite.mockImplementationOnce(async () => { now.mockReturnValue(expired.value.expiresAt); });
    try { await expect(expired.install()).rejects.toThrow('CLOUD_REGISTRATION_CLOSED'); }
    finally { now.mockRestore(); }
    expect(expired.mutations).toHaveLength(0);
    const retired = await fixture(), encrypt = retired.crypto.aesGcmEncrypt.bind(retired.crypto);
    vi.spyOn(retired.crypto, 'aesGcmEncrypt').mockImplementationOnce(async (...args) => {
      const sealed = await encrypt(...args);
      retired.current.mockImplementation(() => { throw Error('ACCOUNT_CHANGED'); });
      return sealed;
    });
    await expect(retired.install()).rejects.toThrow('ACCOUNT_CHANGED');
    expect(retired.mutations).toHaveLength(0); expect(retired.link.disconnect).toHaveBeenCalledOnce();
    const late = await fixture(), lateClock = vi.spyOn(Date, 'now');
    const seal = late.crypto.aesGcmEncrypt.bind(late.crypto);
    vi.spyOn(late.crypto, 'aesGcmEncrypt').mockImplementationOnce(async (...args) => {
      const sealed = await seal(...args);
      lateClock.mockReturnValue(late.value.expiresAt);
      return sealed;
    });
    try { await expect(late.install()).rejects.toThrow('CLOUD_REGISTRATION_CLOSED'); }
    finally { lateClock.mockRestore(); }
    expect(late.mutations).toHaveLength(0);
    const cancelled = await fixture(); cancelled.beforeWrite.mockImplementationOnce(async () => { cancelled.abort.abort(); });
    await expect(cancelled.install()).rejects.toThrow(); expect(cancelled.mutations).toHaveLength(0);
  });

  it('does not dispatch after a tighter live admission ends, even with a settled checkpoint and a longer issued lease', async () => {
    const f = await fixture(), now = vi.spyOn(Date, 'now');
    const deadline = f.value.expiresAt - 100;
    f.owner.writeDeadline = deadline;
    const encrypt = f.crypto.aesGcmEncrypt.bind(f.crypto);
    vi.spyOn(f.crypto, 'aesGcmEncrypt').mockImplementationOnce(async (...args) => {
      const sealed = await encrypt(...args); now.mockReturnValue(deadline); return sealed;
    });
    try { await expect(f.install()).rejects.toThrow('CLOUD_REGISTRATION_CLOSED'); }
    finally { now.mockRestore(); }
    expect(f.beforeWrite).toHaveBeenCalledOnce(); expect(f.mutations).toHaveLength(0);
  });

  it('rejects wrong sequence, flags, header, locator or AEAD session as UNKNOWN with no resend', async () => {
    for (const wrong of ['sequence', 'flags', 'header', 'locator', 'session']) {
      const f = await fixture(); f.options.ack = wrong;
      await expect(f.install()).rejects.toThrow('CLOUD_REGISTRATION_INSTALL_UNKNOWN');
      expect(f.mutations).toHaveLength(1); expect(f.link.disconnect).toHaveBeenCalledOnce();
    }
  });

  it('fails closed on an authenticated general Direct frame before the installation ACK, without another write', async () => {
    const f = await fixture(); f.options.ack = 'time-before-ack';
    await expect(f.install()).rejects.toThrow('CLOUD_REGISTRATION_INSTALL_UNKNOWN');
    expect(f.mutations).toHaveLength(1);
    expect(f.link.sendRecord).toHaveBeenCalledTimes(4); // Hello, Auth init/proof, installation only.
    expect(f.link.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps attempted send failure and ACK timeout UNKNOWN without reliable retries', async () => {
    const rejected = await fixture(); rejected.options.sendFailure = true;
    await expect(rejected.install()).rejects.toThrow('CLOUD_REGISTRATION_INSTALL_UNKNOWN');
    expect(rejected.mutations).toHaveLength(1);
    await expect(rejected.install()).rejects.toThrow('CLOUD_REGISTRATION_ATTEMPT_CONSUMED');
    expect(rejected.link.connect).toHaveBeenCalledOnce();
    const timed = await fixture(); timed.options.drop = true;
    vi.useFakeTimers();
    try {
      const done = expect(timed.install()).rejects.toThrow('CLOUD_REGISTRATION_INSTALL_UNKNOWN');
      await timed.dispatched;
      await vi.advanceTimersByTimeAsync(1000); expect(timed.mutations).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(6000); await done;
      expect(timed.mutations).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
});

function committed(intent: IssuedCloudRegistration) {
  const { ownerUserId: _, tenantId, ...projection } = intent;
  return { ...projection, state: 'committed', registrationProduct: 'cloud', quotaState: 'consumed',
    materialOwnerLogicalDeviceId: intent.sourceLogicalDeviceId, rootBindingId: id(25), bindingRevision: 1,
    committedAt: intent.targetKey.issuedAt, replayed: false,
    device: { logicalDeviceId: intent.targetLogicalDeviceId, tenantId, registrationProduct: 'cloud',
      state: 'active', cloudEnabled: true, credentialVersion: 1, locator: null } };
}

describe('explicit initial Cloud WiFi handoff submission', () => {
  it('requires the scoped committed projection and submits one exact frame on the same AEAD link before local close', async () => {
    const f = await fixture(), installed = await f.install();
    const confirmation = structuredClone(installed.confirmation);
    installed.confirmation.receipt.locator = id(0x44); // Caller mutation cannot change the actual confirmation.
    const confirm = vi.fn(async (request, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      expect(f.mutations).toHaveLength(1); expect(f.link.disconnect).not.toHaveBeenCalled();
      expect(request).toEqual({ ...confirmation, ownerUserId: f.value.ownerUserId, tenantId: f.value.tenantId,
        intentId: f.value.intentId, commitId: id(0x45) });
      return committed(f.value);
    });
    await expect(installed.submitWifiHandoff(id(0x45), confirm)).resolves.toBeUndefined();
    expect(confirm).toHaveBeenCalledOnce(); expect(f.mutations).toHaveLength(2);
    const handoff = f.mutations[1];
    expect(handoff.kind).toBe(Bbp2MessageKind.InitialCloudWifiHandoff);
    expect(handoff.flags).toBe(0); expect(handoff.sequence).not.toBe(0); expect(handoff.sequence).not.toBe(f.mutations[0].sequence);
    const frame = Buffer.from(encodeFrame(handoff));
    expect(frame.length).toBe(46); expect(frame[5]).toBe(10);
    expect(Buffer.from(handoff.body).toString('hex')).toBe(Buffer.from(ackBody).toString('hex'));
    expect(f.link.connect).toHaveBeenCalledOnce(); expect(f.link.disconnect).toHaveBeenCalledOnce();
    expect(f.link.sendRecord.mock.invocationCallOrder[4]).toBeLessThan(f.link.disconnect.mock.invocationCallOrder[0]);
    expect(f.link.waitForMode).not.toHaveBeenCalled();
    await expect(installed.submitWifiHandoff(id(0x45), confirm)).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_CONSUMED');
    expect(confirm).toHaveBeenCalledOnce(); expect(f.mutations).toHaveLength(2);
  });

  it('exposes a single scoped carrier only after GATT close, with original auth erased and derived bytes wiped on return', async () => {
    const f = await fixture(), installed = await f.install();
    let received: InitialCloudWifiCarrierUse | undefined;
    const consume = vi.fn(async (use: InitialCloudWifiCarrierUse) => {
      received = use;
      expect(f.link.disconnect).toHaveBeenCalledOnce(); expect(f.mutations).toHaveLength(2);
      expect(f.credential.controllerSecret).toEqual(new Uint8Array(32));
      const expected = await deriveInitialCloudWifiCredentials(f.crypto, bytes(32, 11), f.value, f.binding());
      try {
        expect(use.ssid).toBe(expected.ssid); expect(use.passphrase).toEqual(expected.passphrase);
        expect(use.proofOfPossession).toEqual(expected.proofOfPossession);
        expect(use.expiresAt).toBe(f.value.expiresAt); use.assertCurrent();
      } finally { expected.passphrase.fill(0); expected.proofOfPossession.fill(0); }
    });
    await installed.submitWifiHandoff(id(18), async () => committed(f.value), consume);
    expect(consume).toHaveBeenCalledOnce(); expect(received!.signal.aborted).toBe(true);
    expect(received!.passphrase).toEqual(new Uint8Array(32)); expect(received!.proofOfPossession).toEqual(new Uint8Array(32));
    expect(received!.assertCurrent).toThrow('CLOUD_REGISTRATION_CARRIER_RETIRED');
    await expect(installed.submitWifiHandoff(id(18), async () => committed(f.value), consume)).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_CONSUMED');
    expect(consume).toHaveBeenCalledOnce();
  });

  it('retires a hung carrier on owner abort and never calls it after an uncertain local release', async () => {
    const bad = await fixture(), notReleased = await bad.install(), uncalled = vi.fn(async () => undefined);
    bad.options.disconnectFailure = true;
    await expect(notReleased.submitWifiHandoff(id(18), async () => committed(bad.value), uncalled))
      .rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_UNKNOWN');
    expect(uncalled).not.toHaveBeenCalled();
    const f = await fixture(), installed = await f.install();
    let received: InitialCloudWifiCarrierUse | undefined;
    const pending = expect(installed.submitWifiHandoff(id(18), async () => committed(f.value), use => {
      received = use; return new Promise(() => undefined);
    })).rejects.toThrow('CLOUD_REGISTRATION_CARRIER_RETIRED');
    await vi.waitFor(() => expect(received?.signal.aborted).toBe(false));
    f.abort.abort(); await pending;
    expect(received!.passphrase).toEqual(new Uint8Array(32)); expect(received!.proofOfPossession).toEqual(new Uint8Array(32));
  });

  it('rejects boolean, pending, other intent, another target, changed Admin, deleted target or wrong tenant with no handoff', async () => {
    const base = committed(intent());
    const cases = [true, { state: 'key_issued' }, { intentId: id(17) }, { materialOwnerLogicalDeviceId: 'other-source' },
      { targetLogicalDeviceId: 'other-cloud' }, { expectedRoot: { ...base.expectedRoot, credentialVersion: 1 } },
      { targetKey: { ...base.targetKey, locator: id(16) } }, { rootBindingId: id(0) },
      { device: { ...base.device, state: 'deleted' } }, { device: { ...base.device, tenantId: 'other-tenant' } }];
    for (const candidate of cases) {
      const f = await fixture(), installed = await f.install();
      const confirm = vi.fn(async () => candidate === true ? true : { ...committed(f.value), ...candidate });
      await expect(installed.submitWifiHandoff(id(18), confirm)).rejects.toThrow('CLOUD_REGISTRATION_COMMIT_MISMATCH');
      expect(f.mutations).toHaveLength(1); expect(f.link.disconnect).toHaveBeenCalledOnce();
      await expect(installed.submitWifiHandoff(id(18), confirm)).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_CONSUMED');
      expect(confirm).toHaveBeenCalledOnce();
    }
  });

  it('does not use a pending, retired or changed owner, including the boundary just before native send', async () => {
    const f = await fixture(), installed = await f.install();
    const confirm = vi.fn(async () => {
      await expect(installed.submitWifiHandoff(id(18), confirm)).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_CONSUMED');
      await installed.close();
      return committed(f.value);
    });
    await expect(installed.submitWifiHandoff(id(18), confirm)).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_RETIRED');
    expect(f.mutations).toHaveLength(1); expect(confirm).toHaveBeenCalledOnce();
    const lost = await fixture(), disconnected = await lost.install();
    lost.nativeDrop(); await vi.waitFor(() => expect(lost.link.disconnect).toHaveBeenCalledOnce());
    await expect(disconnected.submitWifiHandoff(id(18), confirm)).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_RETIRED');
    expect(confirm).toHaveBeenCalledOnce();
    const stale = await fixture(), ready = await stale.install();
    const encrypt = stale.crypto.aesGcmEncrypt.bind(stale.crypto);
    vi.spyOn(stale.crypto, 'aesGcmEncrypt').mockImplementationOnce(async (...args) => {
      const output = await encrypt(...args);
      stale.current.mockImplementation(() => { throw Error('ACCOUNT_CHANGED'); });
      return output;
    });
    await expect(ready.submitWifiHandoff(id(18), async () => committed(stale.value))).rejects.toThrow('ACCOUNT_CHANGED');
    expect(stale.mutations).toHaveLength(1); expect(stale.link.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps a failed confirmation unconfirmed and a possible dispatch/close failure UNKNOWN with no retry', async () => {
    const pending = await fixture(), missing = await pending.install();
    await expect(missing.submitWifiHandoff(id(18), async () => { throw Error('private upstream payload'); }))
      .rejects.toThrow(/^CLOUD_REGISTRATION_CONFIRMATION_UNCONFIRMED$/);
    expect(pending.mutations).toHaveLength(1); expect(pending.link.disconnect).toHaveBeenCalledOnce();
    for (const failure of ['sendFailure', 'disconnectFailure'] as const) {
      const f = await fixture(), installed = await f.install();
      f.options[failure] = true;
      await expect(installed.submitWifiHandoff(id(18), async () => committed(f.value))).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_UNKNOWN');
      expect(f.mutations).toHaveLength(2); expect(f.link.disconnect).toHaveBeenCalledOnce();
      await expect(installed.submitWifiHandoff(id(18), async () => committed(f.value))).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_CONSUMED');
    }
  });

  it('revokes a late confirmation after owner cancellation or the original write deadline', async () => {
    const cancelled = await fixture(), installed = await cancelled.install();
    await expect(installed.submitWifiHandoff(id(18), async (_request, signal) => {
      cancelled.abort.abort();
      expect(signal.aborted).toBe(true);
      return committed(cancelled.value);
    })).rejects.toThrow('CLOUD_REGISTRATION_HANDOFF_RETIRED');
    expect(cancelled.mutations).toHaveLength(1); expect(cancelled.link.disconnect).toHaveBeenCalledOnce();
    const late = await fixture(), ready = await late.install(), now = vi.spyOn(Date, 'now');
    try {
      await expect(ready.submitWifiHandoff(id(18), async () => {
        now.mockReturnValue(late.value.expiresAt);
        return committed(late.value);
      })).rejects.toThrow('CLOUD_REGISTRATION_CLOSED');
    } finally { now.mockRestore(); }
    expect(late.mutations).toHaveLength(1); expect(late.link.disconnect).toHaveBeenCalledOnce();
  });

  it('retires the link on expiry even if the confirm port ignores its abort signal', async () => {
    const f = await fixture(), installed = await f.install();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let resolve!: (value: unknown) => void;
      let signal!: AbortSignal;
      const pending = installed.submitWifiHandoff(id(18), async (_request, stop) => {
        signal = stop;
        return new Promise(r => { resolve = r; });
      });
      const failed = expect(pending).rejects.toThrow('CLOUD_REGISTRATION_CLOSED');
      await vi.advanceTimersByTimeAsync(f.value.expiresAt - Date.now() + 1);
      await failed;
      expect(signal.aborted).toBe(true);
      resolve(committed(f.value));
      await Promise.resolve();
      expect(f.mutations).toHaveLength(1); expect(f.link.disconnect).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
