import { BleDirectCrypto, NoiseNnInitiator, NoisePattern } from '../ble-direct/crypto';
import { decodeLocalSecureRecord, encodeLocalSecureRecord, LocalSecureRecordType } from '../ble-direct/wire';
import { computeLocalAccessPlainProof, decodeLocalAccessPlainProof, encodeLocalAccessPlainProof,
  localAccessNoisePrologue, sameLocalAccessBytes } from '../../protocol/device-v2/local-access';

// Byte transformations only. The client owns authorization, deadlines, native
// lifetime and the single send/receive budget; BBP/ACK/page state lives above it.
export interface LocalAccessRecords {
  readonly responseSize: number;
  readonly overhead: number;
  start(key: Uint8Array, grantAuthenticator: Uint8Array, assertActive: () => void): Promise<Uint8Array>;
  finish(message: Uint8Array): Promise<void>;
  encode(frame: Uint8Array): Promise<Uint8Array>;
  decode(message: Uint8Array): Promise<Uint8Array>;
  clear(): void;
}

class PlainRecords implements LocalAccessRecords {
  readonly responseSize = 37;
  readonly overhead = 0;
  private expected?: Uint8Array;
  constructor(private readonly crypto: Pick<BleDirectCrypto, 'hmac'>) {}
  async start(key: Uint8Array, mac: Uint8Array, assertActive: () => void): Promise<Uint8Array> {
    this.clear();
    this.expected = await computeLocalAccessPlainProof(this.crypto, key, mac, 9);
    assertActive();
    const proof = await computeLocalAccessPlainProof(this.crypto, key, mac, 8);
    try { assertActive(); return encodeLocalAccessPlainProof(8, proof); }
    finally { proof.fill(0); }
  }
  async finish(message: Uint8Array): Promise<void> {
    try {
      const proof = decodeLocalAccessPlainProof(message, 9);
      if (!this.expected || !sameLocalAccessBytes(proof, this.expected)) throw new Error('LOCAL_ACCESS_PROOF_INVALID');
    } finally { this.clear(); }
  }
  async encode(frame: Uint8Array): Promise<Uint8Array> { return frame.slice(); }
  async decode(message: Uint8Array): Promise<Uint8Array> { return message.slice(); }
  clear(): void { this.expected?.fill(0); this.expected = undefined; }
}

class NoiseRecords implements LocalAccessRecords {
  readonly responseSize = 52;
  readonly overhead = 20;
  private noise?: NoiseNnInitiator;
  constructor(private readonly crypto: BleDirectCrypto) {}
  async start(key: Uint8Array, _mac: Uint8Array, assertActive: () => void): Promise<Uint8Array> {
    this.noise = await NoiseNnInitiator.create(this.crypto, NoisePattern.NnPsk0, localAccessNoisePrologue(), key);
    assertActive();
    const first = await this.noise.writeInitiator(new Uint8Array());
    try { assertActive(); return encodeLocalSecureRecord(LocalSecureRecordType.InitiatorHandshake, first); }
    finally { first.fill(0); }
  }
  async finish(message: Uint8Array): Promise<void> {
    const responder = decodeLocalSecureRecord(message, LocalSecureRecordType.ResponderHandshake);
    if (responder.length !== 48) throw new Error('LOCAL_ACCESS_HANDSHAKE_INVALID');
    const payload = await this.noise!.readResponder(responder);
    try { if (payload.length !== 0) throw new Error('LOCAL_ACCESS_HANDSHAKE_INVALID'); }
    finally { payload.fill(0); }
  }
  async encode(frame: Uint8Array): Promise<Uint8Array> {
    const ciphertext = await this.noise!.encrypt(frame);
    try { return encodeLocalSecureRecord(LocalSecureRecordType.Transport, ciphertext); }
    finally { ciphertext.fill(0); }
  }
  async decode(message: Uint8Array): Promise<Uint8Array> {
    const ciphertext = decodeLocalSecureRecord(message, LocalSecureRecordType.Transport);
    if (ciphertext.length <= 16) throw new Error('LOCAL_ACCESS_FRAME_SIZE');
    return this.noise!.decrypt(ciphertext);
  }
  clear(): void { this.noise?.clear(); }
}

export function createLocalAccessRecords(profile: 1 | 2, crypto: BleDirectCrypto): LocalAccessRecords {
  if (profile === 1) return new NoiseRecords(crypto);
  if (profile === 2) return new PlainRecords(crypto);
  throw new Error('LOCAL_ACCESS_PROFILE_UNSUPPORTED');
}
