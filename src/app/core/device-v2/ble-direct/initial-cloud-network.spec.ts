import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bbp2FrameFlag, Bbp2MessageKind, CborReader, decodeFrame, encodeFrame,
  encodeCanonicalMap as map, encodeCanonicalUnsigned as u, encodeCanonicalByteString as b,
  encodeCanonicalArray as array } from '../../protocol/device-v2';
import { BleDirectClient, InitialCloudNetworkOwner } from './client';
import { BleDirectCrypto, DirectSecureContext, controllerAuthProof, directAuthTranscript } from './crypto';
import type { BleControllerCredential, BleControllerCredentialStore } from './credential-store';
import type { BleDirectRecordLink, BleDirectTarget } from './transport';
import { BleApplicationMode, base64UrlEncode } from './wire';
import { deriveInitialCloudNetworkWifiCredentials } from './cloud-registration-carrier';
import { INITIAL_CLOUD_NETWORK_CONTRACT, InstalledKeyInitialNetworkOperation,
  confirmInitialCloudNetworkAcceptance, encodeInitialCloudNetworkHandoff,
  snapshotInstalledKeyInitialNetwork } from './initial-cloud-network-wire';

const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
const id = (value: number, size = 16) => base64UrlEncode(bytes(size, value));
const sha = (...parts: (string | Uint8Array)[]) => {
  const hash = createHash('sha256'); for (const part of parts) hash.update(part); return hash.digest();
};
const response = (kind: Bbp2MessageKind, sequence: number, body: Uint8Array, flags = Bbp2FrameFlag.IsResponse) =>
  encodeFrame({ kind, sequence, body, flags });
function operation(fingerprint = id(4, 32)): InstalledKeyInitialNetworkOperation {
  return { contract: INITIAL_CLOUD_NETWORK_CONTRACT, operationId: id(1), sourceLogicalDeviceId: 'ble_' + id(2),
    targetLogicalDeviceId: 'device_' + id(7), existingLocator: id(6), expiresAt: Date.now() + 120_000,
    expectedRoot: { deviceInstanceId: id(2), accessEpoch: 7, controllerId: id(3), credentialVersion: 3,
      adminFingerprint: fingerprint } };
}

// Independent Node AES-GCM peer. Only link/store/owner boundaries are synthetic;
// no App service, native BLE, Key install or physical network is opened.
async function fixture() {
  const crypto = new BleDirectCrypto(), secret = bytes(32, 11);
  const value = operation(base64UrlEncode(await crypto.adminFingerprint(bytes(16, 3), secret, 3)));
  const credential: BleControllerCredential = { source: 'enrollment', state: 'active', logicalDeviceId: value.sourceLogicalDeviceId,
    deviceInstanceId: bytes(16, 2), controllerId: bytes(16, 3), controllerSecret: secret.slice(), accessEpoch: 7,
    credentialVersion: 3, permissions: 15, intentId: bytes(16, 21), commitId: bytes(16, 22), receipt: bytes(8, 23) };
  const target: BleDirectTarget = { device: { deviceId: 'synthetic-network-link' }, profile: { mode: BleApplicationMode.Direct,
    wireVersion: 2, capabilities: 17, modeLocator: new Uint8Array(8) } };
  const abort = new AbortController(), current = vi.fn(), beforeWrite = vi.fn(async () => undefined);
  const owner: InitialCloudNetworkOwner = { signal: abort.signal, assertCurrent: current, beforeWrite };
  const frames: Uint8Array[] = [], purposes: ReturnType<typeof decodeFrame>[] = [];
  const options = { drop: false, sendFailure: false, disconnectFailure: false, ack: 'exact', packet: 20 };
  let reads = 0, material: Buffer, context: DirectSecureContext, sendSequence = 0;
  let next: Uint8Array | undefined, waiting: { resolve(record: Uint8Array): void; reject(error: Error): void } | undefined;
  const deviceHello = (packet?: number) => map([[0, u(0)], [1, array([u(2)])], [2, u(0x20)], [3, u(512)],
    [4, u(512)], [8, array([u(2)])], ...(packet === undefined ? [] : [[12, u(packet)]] as [number, Uint8Array][])]);
  const emit = (record: Uint8Array) => {
    if (waiting) { const current = waiting; waiting = undefined; current.resolve(record); }
    else next = record;
  };
  const aad = (direction: number, header: Uint8Array) => Buffer.concat([Buffer.from('BLINKER-DIRECT-RECORD/1'),
    Buffer.of(direction), material.subarray(80, 96), Buffer.from(header)]);
  const seal = (payload: Uint8Array) => {
    const header = Buffer.of(0xd3, 0x10, 0, payload.length, 0, 0, 0, sendSequence++);
    const cipher = createCipheriv('aes-256-gcm', material.subarray(32, 64),
      Buffer.concat([material.subarray(72, 80), header.subarray(4)]));
    cipher.setAAD(aad(2, header));
    return Buffer.concat([header, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
  };
  const link = {
    connect: vi.fn(async () => undefined), finishBootstrap: vi.fn(),
    maxPacketSize: vi.fn(async () => options.packet), preparePacketNegotiation: vi.fn(), applyPacketSize: vi.fn(),
    waitForMode: vi.fn(async () => { throw Error('unexpected carrier switch'); }),
    disconnect: vi.fn(async () => {
      waiting?.reject(Error('synthetic closed')); waiting = undefined;
      if (options.disconnectFailure) throw Error('NATIVE_RELEASE_FAILED');
    }),
    sendRecord: vi.fn(async (record: Uint8Array) => {
      if (record[0] === 0x42) { frames.push(record); return; }
      const decipher = createDecipheriv('aes-256-gcm', material.subarray(0, 32),
        Buffer.concat([material.subarray(64, 72), record.subarray(4, 8)]));
      decipher.setAAD(aad(1, record.subarray(0, 8))); decipher.setAuthTag(record.subarray(-16));
      const request = decodeFrame(Buffer.concat([decipher.update(record.subarray(8, -16)), decipher.final()]));
      if (request.kind === Bbp2MessageKind.Hello) {
        emit(Uint8Array.from(seal(response(Bbp2MessageKind.Hello, request.sequence, deviceHello(options.packet))))); return;
      }
      purposes.push(request);
      if (options.sendFailure) throw Error('synthetic unknown write');
      if (options.drop) return;
      const body = encodeInitialCloudNetworkHandoff(value);
      if (options.ack === 'operation') body[3] ^= 1;
      if (options.ack === 'locator') body[20] ^= 1;
      const kind = options.ack === 'kind' ? Bbp2MessageKind.InitialCloudKeyReceipt : Bbp2MessageKind.InitialCloudNetworkAccepted;
      const flags = options.ack === 'flags' ? Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode : Bbp2FrameFlag.IsResponse;
      let reply = response(kind, request.sequence + (options.ack === 'sequence' ? 1 : 0), body, flags);
      if (options.ack === 'header') { reply = Uint8Array.of(...reply.subarray(0, 10), 0, ...reply.subarray(10)); reply[5]++; }
      const encrypted = seal(reply);
      if (options.ack === 'session') encrypted[encrypted.length - 1] ^= 1;
      emit(Uint8Array.from(encrypted));
    }),
    receiveRecord: vi.fn(async (): Promise<Uint8Array> => {
      reads++;
      if (reads === 1) return response(Bbp2MessageKind.Hello, 1, deviceHello());
      if (reads === 2) {
        const reader = new CborReader(decodeFrame(frames[1]).body);
        reader.readMapSize(2); reader.readUnsigned(); reader.readUnsigned(); reader.readUnsigned();
        context = { domain: 2, controllerId: bytes(16, 3), accessEpoch: 7, credentialVersion: 3, permissions: 15,
          clientNonce: reader.readBytes(64).slice(26), deviceNonce: bytes(16, 9) };
        material = Buffer.from(hkdfSync('sha256', secret, sha('BLINKER-DIRECT-AUTH/1', directAuthTranscript(context)),
          'BLINKER-DIRECT-SESSION/1', 96));
        const challenge = new Uint8Array(53); challenge[0] = 0x81; challenge.set(context.deviceNonce, 1);
        new DataView(challenge.buffer).setUint32(17, 15, false);
        challenge.set(await controllerAuthProof(crypto, secret, context, 'device'), 21);
        return response(Bbp2MessageKind.AuthResult, 2, map([[0, u(2)], [1, u(0)], [2, b(challenge)]]));
      }
      if (reads === 3) return response(Bbp2MessageKind.AuthResult, 3, map([[0, u(2)], [1, u(1)]]));
      if (next) { const result = next; next = undefined; return result; }
      return new Promise((resolve, reject) => { waiting = { resolve, reject }; });
    }),
  };
  const load = vi.fn(async () => credential), client = new BleDirectClient(link satisfies BleDirectRecordLink,
    {} as never, { load } as unknown as BleControllerCredentialStore, crypto);
  return { value, crypto, credential, target, abort, owner, beforeWrite, current, purposes, options, link, load, client,
    context: () => context, binding: () => material.subarray(80, 96),
    request: () => client.requestInstalledKeyInitialNetwork(value, target, owner) };
}

afterEach(() => vi.useRealTimers());

describe('installed-Key initial-network wire and carrier', () => {
  it('keeps the new operation separate from an install intent and detaches the exact root', () => {
    const value = operation(), snapshot = snapshotInstalledKeyInitialNetwork(value);
    const body = encodeInitialCloudNetworkHandoff(value);
    expect(Buffer.from(body).toString('hex')).toBe('830150' + '01'.repeat(16) + '50' + '06'.repeat(16));
    expect(confirmInitialCloudNetworkAcceptance(value, body)).toEqual({ operationId: value.operationId, existingLocator: value.existingLocator });
    value.expectedRoot.accessEpoch++; expect(snapshot.expectedRoot.accessEpoch).toBe(7);
    for (const change of [{ contract: 'blinker.access-registration-cloud.v2' }, { operationId: '' },
      { operationId: 'AAAAAAAAAAAAAAAAAAAAAA' }, { existingLocator: id(6) + '=' }, { sourceLogicalDeviceId: value.targetLogicalDeviceId }]) {
      expect(() => snapshotInstalledKeyInitialNetwork({ ...value, ...change } as never)).toThrow('CONTEXT_INVALID');
    }
    for (const key of ['deviceInstanceId', 'controllerId', 'adminFingerprint'] as const) {
      expect(() => snapshotInstalledKeyInitialNetwork({ ...snapshot, expectedRoot: { ...snapshot.expectedRoot,
        [key]: 'A'.repeat(key === 'adminFingerprint' ? 43 : 22) } })).toThrow('CONTEXT_INVALID');
    }
    expect(() => snapshotInstalledKeyInitialNetwork({ ...snapshot, existingLocator: 'A'.repeat(22) })).toThrow('CONTEXT_INVALID');
    for (const payload of [body.subarray(0, 35), Uint8Array.of(...body, 0), Uint8Array.of(0x83, 0x18, 1, ...body.subarray(2))]) {
      expect(() => confirmInitialCloudNetworkAcceptance(snapshot, payload)).toThrow('ACK_INVALID');
    }
  });

  it('matches an independent HMAC for the new domain without altering the original installation domain', async () => {
    const value = operation(), crypto = new BleDirectCrypto(), secret = bytes(32, 11), binding = bytes(16, 8);
    const exact = await deriveInitialCloudNetworkWifiCredentials(crypto, secret, value, binding);
    const digest = (purpose: number, domain: string) => createHmac('sha256', secret).update(domain)
      .update(Uint8Array.of(purpose)).update(bytes(16, 2)).update(binding).update(bytes(16, 1)).update(bytes(16, 6)).digest();
    try {
      expect(exact.ssid).toBe('BLK-' + digest(1, 'blinker.initial-cloud-network-handoff.v1\0').subarray(0, 8).toString('hex'));
      expect(Buffer.from(exact.passphrase).toString('ascii')).toBe(digest(2, 'blinker.initial-cloud-network-handoff.v1\0').subarray(0, 16).toString('hex'));
      expect(Buffer.from(exact.proofOfPossession).toString('ascii')).toBe(digest(3, 'blinker.initial-cloud-network-handoff.v1\0').subarray(0, 16).toString('hex'));
      expect(exact.ssid).not.toBe('BLK-' + digest(1, 'blinker.initial-cloud-wifi-handoff.v1\0').subarray(0, 8).toString('hex'));
    } finally { exact.passphrase.fill(0); exact.proofOfPossession.fill(0); }
  });
});

describe('independent installed-Key network owner', () => {
  it.each([20, 64])('uses original Method 2 and ATT %i, dispatches one 3B after checkpoint, accepts only 3C, then releases before carrier', async packet => {
    const f = await fixture(); f.options.packet = packet;
    f.beforeWrite.mockImplementationOnce(async () => { expect(f.purposes).toHaveLength(0); });
    const accepted = await f.request();
    expect(f.beforeWrite).toHaveBeenCalledOnce(); expect(f.link.connect).toHaveBeenCalledOnce();
    expect(f.context().clientNonce).toHaveLength(16); expect(f.context().clientNonce).not.toEqual(bytes(16, 1));
    expect(f.purposes.map(x => x.kind)).toEqual([Bbp2MessageKind.InitialCloudNetworkHandoff]);
    expect(f.purposes[0].flags).toBe(0); expect(f.purposes[0].body).toEqual(encodeInitialCloudNetworkHandoff(f.value));
    expect(accepted.acceptance).toEqual({ operationId: f.value.operationId, existingLocator: f.value.existingLocator });
    expect(f.credential.controllerSecret).toEqual(new Uint8Array(32));
    if (packet === 64) expect(f.link.applyPacketSize).toHaveBeenCalledExactlyOnceWith(64);
    expect(f.link.disconnect).not.toHaveBeenCalled();
    await accepted.useWifiCarrier(async use => {
      expect(f.link.disconnect).toHaveBeenCalledOnce(); use.assertCurrent(); expect(use.passphrase).toHaveLength(32);
    });
    await expect(accepted.useWifiCarrier(async () => undefined)).rejects.toThrow('CARRIER_CONSUMED');
    expect(f.link.waitForMode).not.toHaveBeenCalled(); expect(f.purposes).toHaveLength(1);
    await expect(f.request()).rejects.toThrow('ATTEMPT_CONSUMED');
  });

  it('rejects changed root or non-Admin credentials before acquiring native BLE', async () => {
    for (const change of ['version', 'role', 'fingerprint'] as const) {
      const f = await fixture();
      if (change === 'version') f.credential.credentialVersion++;
      else if (change === 'role') f.credential.permissions = 3;
      else f.value.expectedRoot.adminFingerprint = id(31, 32);
      await expect(f.request()).rejects.toThrow('ROOT_CHANGED');
      expect(f.link.connect).not.toHaveBeenCalled(); expect(f.purposes).toHaveLength(0);
      expect(f.credential.controllerSecret).toEqual(new Uint8Array(32));
    }
  });

  it.each(['operation', 'locator', 'kind', 'flags', 'sequence', 'header', 'session'])('retains UNKNOWN without retransmission for %s mismatch', async ack => {
    const f = await fixture(); f.options.ack = ack;
    await expect(f.request()).rejects.toThrow('INITIAL_CLOUD_NETWORK_HANDOFF_UNKNOWN');
    expect(f.purposes).toHaveLength(1); expect(f.link.disconnect).toHaveBeenCalledOnce();
    await expect(f.request()).rejects.toThrow('ATTEMPT_CONSUMED');
  });

  it('marks native send failure UNKNOWN and does not dispatch when checkpoint cancels', async () => {
    const sent = await fixture(); sent.options.sendFailure = true;
    await expect(sent.request()).rejects.toThrow('HANDOFF_UNKNOWN'); expect(sent.purposes).toHaveLength(1);
    const cancelled = await fixture(); cancelled.beforeWrite.mockImplementationOnce(async () => { cancelled.abort.abort(); return undefined; });
    await expect(cancelled.request()).rejects.toThrow(); expect(cancelled.purposes).toHaveLength(0);
  });

  it('does not retry a dropped 3C response, and never uses a carrier after failed native release', async () => {
    const dropped = await fixture(); dropped.options.drop = true; vi.useFakeTimers();
    const result = dropped.request().catch(error => error);
    await vi.waitFor(() => expect(dropped.purposes).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(6001);
    expect(await result).toMatchObject({ message: 'INITIAL_CLOUD_NETWORK_HANDOFF_UNKNOWN' });
    expect(dropped.purposes).toHaveLength(1); vi.useRealTimers();
    const release = await fixture(), accepted = await release.request(), consumer = vi.fn(async () => undefined);
    release.options.disconnectFailure = true;
    await expect(accepted.useWifiCarrier(consumer)).rejects.toThrow('NATIVE_RELEASE_FAILED');
    expect(consumer).not.toHaveBeenCalled();
  });
});
