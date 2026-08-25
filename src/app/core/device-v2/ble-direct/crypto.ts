const text = new TextEncoder();

function bytes(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function nonZero(value: Uint8Array): boolean {
  return value.some(byte => byte !== 0);
}

export class BleDirectCrypto {
  constructor(private readonly webCrypto: Crypto = globalThis.crypto) {
    if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== 'function') {
      throw new Error('BLE_DIRECT_CRYPTO_UNAVAILABLE');
    }
  }

  random(size: number): Uint8Array {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const value = this.webCrypto.getRandomValues(new Uint8Array(size));
      if (nonZero(value)) return value;
    }
    throw new Error('BLE_DIRECT_RANDOM_FAILED');
  }

  async sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
    return new Uint8Array(await this.webCrypto.subtle.digest('SHA-256', bytes(concat(...parts))));
  }

  async hmac(key: Uint8Array, ...parts: Uint8Array[]): Promise<Uint8Array> {
    const imported = await this.webCrypto.subtle.importKey(
      'raw', bytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    return new Uint8Array(await this.webCrypto.subtle.sign('HMAC', imported, bytes(concat(...parts))));
  }

  async hkdf(
    salt: Uint8Array,
    input: Uint8Array,
    info: Uint8Array,
    length: number,
  ): Promise<Uint8Array> {
    const imported = await this.webCrypto.subtle.importKey('raw', bytes(input), 'HKDF', false, [
      'deriveBits',
    ]);
    return new Uint8Array(await this.webCrypto.subtle.deriveBits({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: bytes(salt),
      info: bytes(info),
    }, imported, length * 8));
  }

  async aesGcmEncrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    associatedData: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array> {
    const imported = await this.webCrypto.subtle.importKey(
      'raw', bytes(key), { name: 'AES-GCM' }, false, ['encrypt'],
    );
    return new Uint8Array(await this.webCrypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: bytes(nonce),
      additionalData: bytes(associatedData),
      tagLength: 128,
    }, imported, bytes(plaintext)));
  }

  async aesGcmDecrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    associatedData: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    const imported = await this.webCrypto.subtle.importKey(
      'raw', bytes(key), { name: 'AES-GCM' }, false, ['decrypt'],
    );
    try {
      return new Uint8Array(await this.webCrypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: bytes(nonce),
        additionalData: bytes(associatedData),
        tagLength: 128,
      }, imported, bytes(ciphertext)));
    } catch {
      throw new Error('BLE_DIRECT_AUTHENTICATION_FAILED');
    }
  }

  async x25519(): Promise<{
    publicKey: Uint8Array;
    sharedSecret(remotePublicKey: Uint8Array): Promise<Uint8Array>;
  }> {
    let pair: CryptoKeyPair;
    try {
      pair = await this.webCrypto.subtle.generateKey(
        { name: 'X25519' }, false, ['deriveBits'],
      ) as CryptoKeyPair;
    } catch {
      throw new Error('BLE_DIRECT_X25519_UNAVAILABLE');
    }
    const publicKey = new Uint8Array(await this.webCrypto.subtle.exportKey('raw', pair.publicKey));
    if (publicKey.length !== 32 || !nonZero(publicKey)) {
      throw new Error('BLE_DIRECT_X25519_FAILED');
    }
    return {
      publicKey,
      sharedSecret: async (remotePublicKey: Uint8Array) => {
        if (remotePublicKey.length !== 32 || !nonZero(remotePublicKey)) {
          throw new Error('BLE_DIRECT_REMOTE_KEY_INVALID');
        }
        let remote: CryptoKey;
        try {
          remote = await this.webCrypto.subtle.importKey(
            'raw', bytes(remotePublicKey), { name: 'X25519' }, false, [],
          );
          const secret = new Uint8Array(await this.webCrypto.subtle.deriveBits({
            name: 'X25519', public: remote,
          }, pair.privateKey, 256));
          if (!nonZero(secret)) throw new Error();
          return secret;
        } catch {
          throw new Error('BLE_DIRECT_X25519_FAILED');
        }
      },
    };
  }
}

export enum NoisePattern {
  Nn = 1,
  NnPsk0 = 2,
}

export class NoiseNnInitiator {
  private chainingKey: Uint8Array = new Uint8Array(32);
  private handshakeHash: Uint8Array = new Uint8Array(32);
  private handshakeKey?: Uint8Array;
  private handshakeNonce = 0n;
  private sendKey?: Uint8Array;
  private receiveKey?: Uint8Array;
  private sendNonce = 0n;
  private receiveNonce = 0n;
  private ephemeral?: Awaited<ReturnType<BleDirectCrypto['x25519']>>;
  private state: 'initial' | 'response' | 'transport' | 'failed' = 'initial';

  private constructor(
    private readonly crypto: BleDirectCrypto,
    readonly pattern: NoisePattern,
  ) {}

  static async create(
    crypto: BleDirectCrypto,
    pattern: NoisePattern,
    prologue: Uint8Array,
    psk?: Uint8Array,
  ): Promise<NoiseNnInitiator> {
    if ((pattern === NoisePattern.NnPsk0) !== (psk?.length === 32)) {
      throw new Error('BLE_DIRECT_NOISE_PSK_INVALID');
    }
    const session = new NoiseNnInitiator(crypto, pattern);
    const name = text.encode(pattern === NoisePattern.Nn
      ? 'Noise_NN_25519_AESGCM_SHA256'
      : 'Noise_NNpsk0_25519_AESGCM_SHA256');
    if (name.length > 32) throw new Error('BLE_DIRECT_NOISE_SUITE_INVALID');
    session.handshakeHash.set(name);
    session.chainingKey.set(session.handshakeHash);
    session.handshakeHash = await crypto.sha256(session.handshakeHash, prologue);
    if (psk) await session.mixKeyAndHash(psk);
    return session;
  }

  async writeInitiator(payload: Uint8Array): Promise<Uint8Array> {
    if (this.state !== 'initial') return this.fail('BLE_DIRECT_NOISE_STATE');
    this.ephemeral = await this.crypto.x25519();
    await this.mixEphemeral(this.ephemeral.publicKey);
    const encodedPayload = await this.encryptAndHash(payload);
    this.state = 'response';
    return concat(this.ephemeral.publicKey, encodedPayload);
  }

  async readResponder(message: Uint8Array): Promise<Uint8Array> {
    if (this.state !== 'response' || message.length < 48 || !this.ephemeral) {
      return this.fail('BLE_DIRECT_NOISE_STATE');
    }
    const remote = message.slice(0, 32);
    await this.mixEphemeral(remote);
    const shared = await this.ephemeral.sharedSecret(remote);
    await this.mixKey(shared);
    shared.fill(0);
    const payload = await this.decryptAndHash(message.slice(32));
    const split = await this.crypto.hkdf(this.chainingKey, new Uint8Array(), new Uint8Array(), 64);
    this.sendKey = split.slice(0, 32);
    this.receiveKey = split.slice(32, 64);
    split.fill(0);
    this.chainingKey.fill(0);
    this.handshakeKey?.fill(0);
    this.handshakeKey = undefined;
    this.ephemeral = undefined;
    this.state = 'transport';
    return payload;
  }

  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    if (this.state !== 'transport' || !this.sendKey) return this.fail('BLE_DIRECT_NOISE_STATE');
    return this.encryptWithKey(this.sendKey, 'sendNonce', new Uint8Array(), plaintext);
  }

  async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
    if (this.state !== 'transport' || !this.receiveKey) return this.fail('BLE_DIRECT_NOISE_STATE');
    return this.decryptWithKey(this.receiveKey, 'receiveNonce', new Uint8Array(), ciphertext);
  }

  transcriptHash(): Uint8Array {
    if (this.state !== 'transport') throw new Error('BLE_DIRECT_NOISE_STATE');
    return this.handshakeHash.slice();
  }

  clear(): void {
    this.chainingKey.fill(0);
    this.handshakeHash.fill(0);
    this.handshakeKey?.fill(0);
    this.sendKey?.fill(0);
    this.receiveKey?.fill(0);
    this.handshakeKey = this.sendKey = this.receiveKey = undefined;
    this.ephemeral = undefined;
    this.state = 'failed';
  }

  private async mixHash(input: Uint8Array): Promise<void> {
    this.handshakeHash = await this.crypto.sha256(this.handshakeHash, input);
  }

  private async mixKey(input: Uint8Array): Promise<void> {
    const output = await this.crypto.hkdf(this.chainingKey, input, new Uint8Array(), 64);
    this.chainingKey = output.slice(0, 32);
    this.handshakeKey = output.slice(32, 64);
    output.fill(0);
    this.handshakeNonce = 0n;
  }

  private async mixKeyAndHash(input: Uint8Array): Promise<void> {
    const output = await this.crypto.hkdf(this.chainingKey, input, new Uint8Array(), 96);
    this.chainingKey = output.slice(0, 32);
    await this.mixHash(output.slice(32, 64));
    this.handshakeKey = output.slice(64, 96);
    output.fill(0);
    this.handshakeNonce = 0n;
  }

  private async mixEphemeral(publicKey: Uint8Array): Promise<void> {
    await this.mixHash(publicKey);
    if (this.pattern === NoisePattern.NnPsk0) await this.mixKey(publicKey);
  }

  private async encryptAndHash(plaintext: Uint8Array): Promise<Uint8Array> {
    const ciphertext = this.handshakeKey
      ? await this.encryptWithKey(
        this.handshakeKey, 'handshakeNonce', this.handshakeHash, plaintext,
      )
      : plaintext.slice();
    await this.mixHash(ciphertext);
    return ciphertext;
  }

  private async decryptAndHash(ciphertext: Uint8Array): Promise<Uint8Array> {
    const plaintext = this.handshakeKey
      ? await this.decryptWithKey(
        this.handshakeKey, 'handshakeNonce', this.handshakeHash, ciphertext,
      )
      : ciphertext.slice();
    await this.mixHash(ciphertext);
    return plaintext;
  }

  private nonce(value: bigint): Uint8Array {
    if (value >= 0xffffffffffffffffn) return this.fail('BLE_DIRECT_NONCE_EXHAUSTED');
    const nonce = new Uint8Array(12);
    new DataView(nonce.buffer).setBigUint64(4, value, false);
    return nonce;
  }

  private async encryptWithKey(
    key: Uint8Array,
    counter: 'handshakeNonce' | 'sendNonce',
    associatedData: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array> {
    const value = this[counter];
    const output = await this.crypto.aesGcmEncrypt(key, this.nonce(value), associatedData, plaintext);
    this[counter] = value + 1n;
    return output;
  }

  private async decryptWithKey(
    key: Uint8Array,
    counter: 'handshakeNonce' | 'receiveNonce',
    associatedData: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    const value = this[counter];
    const output = await this.crypto.aesGcmDecrypt(
      key, this.nonce(value), associatedData, ciphertext,
    );
    this[counter] = value + 1n;
    return output;
  }

  private fail(message: string): never {
    this.clear();
    throw new Error(message);
  }
}

const DIRECT_SESSION_INFO = text.encode('BLINKER-DIRECT-SESSION/1');
const DIRECT_AUTH_DOMAIN = text.encode('BLINKER-DIRECT-AUTH/1');
const DIRECT_RECORD_DOMAIN = text.encode('BLINKER-DIRECT-RECORD/1');

export interface DirectSecureContext {
  controllerId: Uint8Array;
  domain: number;
  accessEpoch: number;
  credentialVersion: number;
  permissions: number;
  clientNonce: Uint8Array;
  deviceNonce: Uint8Array;
}

export class DirectSecureInitiator {
  private sendSequence = 0;
  private receiveSequence = 0;

  private constructor(
    private readonly crypto: BleDirectCrypto,
    private readonly sendKey: Uint8Array,
    private readonly receiveKey: Uint8Array,
    private readonly sendNoncePrefix: Uint8Array,
    private readonly receiveNoncePrefix: Uint8Array,
    private readonly binding: Uint8Array,
  ) {}

  static async create(
    crypto: BleDirectCrypto,
    secret: Uint8Array,
    context: DirectSecureContext,
  ): Promise<DirectSecureInitiator> {
    const transcript = directAuthTranscript(context);
    const hash = await crypto.sha256(DIRECT_AUTH_DOMAIN, transcript);
    const material = await crypto.hkdf(hash, secret, DIRECT_SESSION_INFO, 96);
    const session = new DirectSecureInitiator(
      crypto,
      material.slice(0, 32),
      material.slice(32, 64),
      material.slice(64, 72),
      material.slice(72, 80),
      material.slice(80, 96),
    );
    material.fill(0);
    return session;
  }

  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    if (!plaintext.length || plaintext.length > 0xffff || this.sendSequence > 0xffffffff) {
      throw new Error('BLE_DIRECT_RECORD_INVALID');
    }
    const header = directRecordHeader(plaintext.length, this.sendSequence);
    const ciphertext = await this.crypto.aesGcmEncrypt(
      this.sendKey,
      directRecordNonce(this.sendNoncePrefix, this.sendSequence),
      concat(DIRECT_RECORD_DOMAIN, Uint8Array.of(1), this.binding, header),
      plaintext,
    );
    this.sendSequence += 1;
    return concat(header, ciphertext);
  }

  async decrypt(record: Uint8Array): Promise<Uint8Array> {
    if (record.length < 24 || record[0] !== 0xd3 || record[1] !== 0x10) {
      throw new Error('BLE_DIRECT_RECORD_INVALID');
    }
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    const size = view.getUint16(2, false);
    const sequence = view.getUint32(4, false);
    if (!size || record.length !== 8 + size + 16 || sequence !== this.receiveSequence) {
      throw new Error('BLE_DIRECT_RECORD_SEQUENCE');
    }
    const header = record.slice(0, 8);
    const plaintext = await this.crypto.aesGcmDecrypt(
      this.receiveKey,
      directRecordNonce(this.receiveNoncePrefix, sequence),
      concat(DIRECT_RECORD_DOMAIN, Uint8Array.of(2), this.binding, header),
      record.slice(8),
    );
    this.receiveSequence += 1;
    return plaintext;
  }

  clear(): void {
    this.sendKey.fill(0);
    this.receiveKey.fill(0);
    this.sendNoncePrefix.fill(0);
    this.receiveNoncePrefix.fill(0);
    this.binding.fill(0);
    this.sendSequence = 0xffffffff + 1;
    this.receiveSequence = 0xffffffff + 1;
  }
}

export function directAuthTranscript(context: DirectSecureContext): Uint8Array {
  const metadata = new Uint8Array(13);
  metadata[0] = context.domain;
  const view = new DataView(metadata.buffer);
  view.setUint32(1, context.accessEpoch, false);
  view.setUint32(5, context.credentialVersion, false);
  view.setUint32(9, context.permissions, false);
  return concat(
    Uint8Array.of(1, 0, 2, 1),
    context.controllerId,
    metadata,
    context.clientNonce,
    context.deviceNonce,
  );
}

export async function controllerAuthProof(
  crypto: BleDirectCrypto,
  secret: Uint8Array,
  context: DirectSecureContext,
  role: 'device' | 'app',
): Promise<Uint8Array> {
  const domain = text.encode(role === 'device'
    ? 'BLINKER-CONTROLLER-DEVICE-PROOF/1'
    : 'BLINKER-CONTROLLER-APP-PROOF/1');
  return crypto.hmac(secret, domain, directAuthTranscript(context));
}

function directRecordHeader(size: number, sequence: number): Uint8Array {
  const header = new Uint8Array(8);
  header.set([0xd3, 0x10]);
  const view = new DataView(header.buffer);
  view.setUint16(2, size, false);
  view.setUint32(4, sequence, false);
  return header;
}

function directRecordNonce(prefix: Uint8Array, sequence: number): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(prefix);
  new DataView(nonce.buffer).setUint32(8, sequence, false);
  return nonce;
}

export const bleDirectText = text;
export const concatBytes = concat;
export const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};
