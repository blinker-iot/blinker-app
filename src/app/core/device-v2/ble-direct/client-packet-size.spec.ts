import { afterEach, describe, expect, it, vi } from 'vitest';
import { BleDirectClient } from './client';
import { BleDirectCrypto, DirectSecureInitiator } from './crypto';
import { BleDirectSession } from './session';
import { BleDirectRecordLink, BleDirectTarget } from './transport';
import { BleApplicationMode } from './wire';
import { BBP2_FEATURE_TIME_SYNC, CborReader, decodeFrame, encodeCanonicalArray as a,
  encodeCanonicalByteString as b, encodeCanonicalMap as m, encodeCanonicalUnsigned as u, encodeFrame } from '../../protocol/device-v2';
import { Bbp2FrameFlag, Bbp2MessageKind } from '../../protocol/device-v2/types';

function fixture(capacity: number, accepted?: number, loseAnswer = false) {
  const proof = new Uint8Array(32).fill(7), payload = new Uint8Array(53);
  payload[0] = 0x81; payload.fill(1, 1, 17); new DataView(payload.buffer).setUint32(17, 15, false); payload.set(proof, 21);
  const hello = (packet?: number) => m([[0, u(0)], [1, a([u(2)])], [2, u(0x22e3 | BBP2_FEATURE_TIME_SYNC)],
    [3, u(512)], [4, u(512)], [8, a([u(2)])], [9, u(4)],
    ...(packet === undefined ? [] : [[12, u(packet)]] as Array<[number, Uint8Array]>)]);
  const response = (kind: Bbp2MessageKind, sequence: number, body: Uint8Array) => encodeFrame({
    kind, sequence, body, flags: Bbp2FrameFlag.IsResponse,
  });
  let rejectPendingReceive: ((error: Error) => void) | undefined;
  const receive = vi.fn(() => new Promise<Uint8Array>((_resolve, reject) => { rejectPendingReceive = reject; }))
    .mockResolvedValueOnce(response(Bbp2MessageKind.Hello, 1, hello()))
    .mockResolvedValueOnce(response(Bbp2MessageKind.AuthResult, 2, m([[0, u(2)], [1, u(0)], [2, b(payload)]])))
    .mockResolvedValueOnce(response(Bbp2MessageKind.AuthResult, 3, m([[0, u(2)], [1, u(1)]])));
  if (capacity > 20) {
    if (loseAnswer) receive.mockRejectedValueOnce(Error('BLE_DIRECT_RECEIVE_TIMEOUT'));
    else receive.mockResolvedValueOnce(response(Bbp2MessageKind.Hello, 4, hello(accepted)));
  }
  const link = {
    connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => { rejectPendingReceive?.(Error('closed')); }),
    sendRecord: vi.fn(async (_record: Uint8Array) => undefined), receiveRecord: receive,
    maxPacketSize: vi.fn(async () => capacity), preparePacketNegotiation: vi.fn(),
    applyPacketSize: vi.fn(), rememberPacketFallback: vi.fn(),
  };
  const secure = { encrypt: vi.fn(async (value: Uint8Array) => value), decrypt: vi.fn(async (value: Uint8Array) => value), clear: vi.fn() };
  // An explicitly controlled cryptographic seam tests negotiation ordering,
  // not cryptographic validity. Frozen Method2/SecureRecord vectors cover that.
  vi.spyOn(DirectSecureInitiator, 'create').mockResolvedValue(secure as unknown as DirectSecureInitiator);
  vi.spyOn(BleDirectSession.prototype, 'synchronize').mockResolvedValue(undefined);
  const crypto = new BleDirectCrypto(); vi.spyOn(crypto, 'random').mockReturnValue(new Uint8Array(16).fill(1));
  vi.spyOn(crypto, 'hmac').mockResolvedValue(proof);
  const credential = { state: 'active', logicalDeviceId: 'packet-test', deviceInstanceId: new Uint8Array(16).fill(1),
    accessEpoch: 1, controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    credentialVersion: 1, permissions: 15 } as const;
  const store = { load: vi.fn(async () => structuredClone(credential)) };
  const client = new BleDirectClient(link as unknown as BleDirectRecordLink, {} as any, store as any, crypto);
  const target = { profile: { mode: BleApplicationMode.Direct } } as BleDirectTarget;
  return { link, secure, client, target };
}

const appFeatures = (body: Uint8Array) => {
  const reader = new CborReader(body); reader.readMapSize(10);
  reader.readUnsigned(); reader.readUnsigned(); reader.readUnsigned(); reader.readArraySize(4); reader.readUnsigned();
  reader.readUnsigned(); return reader.readUnsigned();
};

describe('authenticated BLE packet-size activation', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('keeps the old20-byte three-message auth path when native MTU remains23', async () => {
    const { client, link, target, secure } = fixture(20);
    const session = await client.connect('packet-test', target);
    expect(link.sendRecord).toHaveBeenCalledTimes(3); expect(secure.encrypt).not.toHaveBeenCalled();
    expect(link.preparePacketNegotiation).not.toHaveBeenCalled(); expect(link.applyPacketSize).not.toHaveBeenCalled();
    expect(appFeatures(decodeFrame(link.sendRecord.mock.calls[0]![0]).body) & BBP2_FEATURE_TIME_SYNC).not.toBe(0);
    await session.close();
  });

  it.each([20, 64, 244, undefined])('activates peer accepted%s only after encryptedHello; absent capability means20', async accepted => {
    const { client, link, target, secure } = fixture(244, accepted);
    const session = await client.connect('packet-test', target);
    expect(link.sendRecord).toHaveBeenCalledTimes(4); expect(secure.encrypt).toHaveBeenCalledOnce();
    expect(appFeatures(decodeFrame(link.sendRecord.mock.calls[0]![0]).body) & BBP2_FEATURE_TIME_SYNC).toBe(0);
    const proposed = decodeFrame(secure.encrypt.mock.calls[0]![0]); expect(proposed.sequence).toBe(4);
    expect(appFeatures(proposed.body) & BBP2_FEATURE_TIME_SYNC).not.toBe(0);
    expect(link.preparePacketNegotiation).toHaveBeenCalledExactlyOnceWith(244);
    expect(link.preparePacketNegotiation.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(DirectSecureInitiator.create).mock.invocationCallOrder[0]!);
    expect(link.applyPacketSize).toHaveBeenCalledExactlyOnceWith(accepted ?? 20);
    expect(link.applyPacketSize.mock.invocationCallOrder[0]).toBeGreaterThan(secure.decrypt.mock.invocationCallOrder[0]!);
    expect(link.receiveRecord).toHaveBeenCalledWith(2000);
    expect(link.rememberPacketFallback).not.toHaveBeenCalled();
    await session.close();
  });

  it('cannot activate a peer answer above the physical proposal', async () => {
    const { client, link, target, secure } = fixture(64, 244);
    await expect(client.connect('packet-test', target)).rejects.toThrow('BLE_DIRECT_PACKET_NEGOTIATION_INVALID');
    expect(link.applyPacketSize).not.toHaveBeenCalled(); expect(secure.clear).toHaveBeenCalledOnce();
    expect(link.rememberPacketFallback).toHaveBeenCalledOnce(); expect(link.disconnect).toHaveBeenCalledOnce();
  });

  it('a lost secure answer closes and marks20-on-reconnect without starting business traffic', async () => {
    const test = fixture(244, 244, true);
    await expect(test.client.connect('packet-test', test.target)).rejects.toThrow('BLE_DIRECT_RECEIVE_TIMEOUT');
    expect(test.link.applyPacketSize).not.toHaveBeenCalled(); expect(test.secure.clear).toHaveBeenCalledOnce();
    expect(test.link.rememberPacketFallback).toHaveBeenCalledOnce(); expect(test.link.disconnect).toHaveBeenCalledOnce();
    expect(test.link.sendRecord).toHaveBeenCalledTimes(4);
  });
});
