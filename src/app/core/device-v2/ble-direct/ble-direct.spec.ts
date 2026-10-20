import { of } from 'rxjs';

import { HttpBleEnrollmentApi } from './api';
import {
  BleDirectCrypto,
  DirectSecureInitiator,
  NoiseNnInitiator,
  NoisePattern,
  controllerAuthProof,
} from './crypto';
import { FragmentReassembler } from './transport';
import {
  BleApplicationMode,
  LocalSecureRecordType,
  base64UrlEncode,
  ControllerMutationOperation,
  decodeBleEnrollmentGrant,
  decodeBleModeProfile,
  decodeControllerMutationReceipt,
  decodeLocalSecureRecord,
  encodeBleEnrollmentHelloRequest,
  encodeBleEnrollmentRequest,
  encodeControllerAuthInit,
  encodeControllerMutationReceipt,
  encodeLocalSecureRecord,
  localSecureNoisePrologue,
} from './wire';

const hex = (value: string): Uint8Array => Uint8Array.from(
  value.match(/../g) ?? [], pair => Number.parseInt(pair, 16),
);
const hexText = (value: Uint8Array): string => Array.from(
  value, byte => byte.toString(16).padStart(2, '0'),
).join('');

describe('BLE Direct production wire', () => {
  it('round-trips a Revoke receipt with the required zero secret digest', () => {
    const encoded = encodeControllerMutationReceipt({
      operation: ControllerMutationOperation.Revoke,
      grantId: new Uint8Array(16).fill(0x11),
      deviceInstanceId: new Uint8Array(16).fill(0x12),
      accessEpoch: 3,
      controllerId: new Uint8Array(16).fill(0x13),
      credentialVersion: 2,
      permissions: 0,
      secretDigest: new Uint8Array(32),
      proofKind: 0,
      proof: new Uint8Array(),
    });

    const receipt = decodeControllerMutationReceipt(encoded);
    expect(receipt.operation).toBe(ControllerMutationOperation.Revoke);
    expect(receipt.secretDigest).toEqual(new Uint8Array(32));
    expect(receipt.proof).toEqual(new Uint8Array());
  });

  it('binds the current credential version into Method 2 auth init', () => {
    expect(hexText(encodeControllerAuthInit(
      hex('101112131415161718191a1b1c1d1e1f'),
      0x20212223,
      0x30313233,
      hex('404142434445464748494a4b4c4d4e4f'),
    ))).toBe(
      'a2000201582a01101112131415161718191a1b1c1d1e1f02'
      + '2021222330313233404142434445464748494a4b4c4d4e4f',
    );
  });

  it('encodes Enrollment v2 with the raw PresenceKey only inside the Noise payload', () => {
    expect(hexText(encodeBleEnrollmentHelloRequest())).toBe('a3000201010201');
    const request = encodeBleEnrollmentRequest(
      Uint8Array.of(0xaa),
      new Uint8Array(32).fill(0xbb),
      new Uint8Array(16).fill(0xcc),
    );
    expect(hexText(request)).toBe(
      'a60002010302020341aa045820' + 'bb'.repeat(32) + '0550' + 'cc'.repeat(16),
    );
  });

  it('matches the frozen Noise NN and LocalSecureRecord vector', async () => {
    class GoldenCrypto extends BleDirectCrypto {
      override async x25519(): Promise<{
        publicKey: Uint8Array;
        sharedSecret(remotePublicKey: Uint8Array): Promise<Uint8Array>;
      }> {
        return {
          publicKey: hex('358072d6365880d1aeea329adf9121383851ed21a28e3b75e965d0d2cd166254'),
          sharedSecret: async remotePublicKey => {
            expect(hexText(remotePublicKey)).toBe(
              '79a631eede1bf9c98f12032cdeadd0e7a079398fc786b88cc846ec89af85a51a',
            );
            return hex('04c304fb1ca83cee75e206344231f33797e07d9929db670994b7c6fbeb1dc255');
          },
        };
      }
    }
    const crypto = new GoldenCrypto();
    const noise = await NoiseNnInitiator.create(
      crypto, NoisePattern.Nn, localSecureNoisePrologue(NoisePattern.Nn),
    );
    const message1 = await noise.writeInitiator(hex('a200010101'));
    expect(hexText(message1)).toBe(
      '358072d6365880d1aeea329adf9121383851ed21a28e3b75e965d0d2cd166254a200010101',
    );
    const record1 = encodeLocalSecureRecord(LocalSecureRecordType.InitiatorHandshake, message1);
    expect(hexText(record1)).toBe(
      'b3110025358072d6365880d1aeea329adf9121383851ed21a28e3b75e965d0d2cd166254a200010101',
    );
    expect(hexText(decodeLocalSecureRecord(
      record1, LocalSecureRecordType.InitiatorHandshake,
    ))).toBe(hexText(message1));

    const payload = await noise.readResponder(hex(
      '79a631eede1bf9c98f12032cdeadd0e7a079398fc786b88cc846ec89af85a51a'
      + '88242d317f6692cc5ffea62f5f72117c02d9ab',
    ));
    expect(hexText(payload)).toBe('a10001');
    expect(hexText(noise.transcriptHash())).toBe(
      'de63745a40174b64dadafa064286c8f2a945b01df15ff9647a26eb6ed1393aaa',
    );
    expect(hexText(await noise.encrypt(hex('01040007a10001')))).toBe(
      'e321714db3193f883d32f97c843545025b13b8b53bf8d8',
    );
    expect(hexText(await noise.decrypt(hex(
      '24ed024db1e69ffce51a9da628e00d4d6b1690a2',
    )))).toBe('01050007');
  });

  it('derives the same X25519 secret through WebCrypto', async () => {
    const crypto = new BleDirectCrypto();
    const alice = await crypto.x25519();
    const bob = await crypto.x25519();
    const [aliceSecret, bobSecret] = await Promise.all([
      alice.sharedSecret(bob.publicKey),
      bob.sharedSecret(alice.publicKey),
    ]);

    expect(alice.publicKey.length).toBe(32);
    expect(bob.publicKey.length).toBe(32);
    expect(aliceSecret.length).toBe(32);
    expect(hexText(aliceSecret)).toBe(hexText(bobSecret));
    aliceSecret.fill(0);
    bobSecret.fill(0);
  });

  it('matches Method 2 proofs and DirectSecureRecord vectors', async () => {
    const crypto = new BleDirectCrypto();
    const secret = hex('a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf');
    const context = {
      controllerId: hex('101112131415161718191a1b1c1d1e1f'),
      domain: 1,
      accessEpoch: 0,
      credentialVersion: 7,
      permissions: 3,
      clientNonce: hex('202122232425262728292a2b2c2d2e2f'),
      deviceNonce: hex('404142434445464748494a4b4c4d4e4f'),
    };
    expect(hexText(await controllerAuthProof(crypto, secret, context, 'device'))).toBe(
      '252e60b1dbddc10bd4ff3c7f104d924434a6a82bbd6d73d313d9128fb137a135',
    );
    expect(hexText(await controllerAuthProof(crypto, secret, context, 'app'))).toBe(
      'f6a4bc63b676ddf56595e3f25a23d5bf3bfb569b96e3bdf9052ab8b7452e4506',
    );

    const secure = await DirectSecureInitiator.create(crypto, secret, context);
    expect(hexText(await secure.encrypt(hex(
      '424b0212010a12340007a1646c616d70f4',
    )))).toBe(
      'd310001100000000450d5a4e8154ffa16feacf5f00e6b21a1bed8eef9583b37005a91948d7518b1ebe',
    );
    expect(hexText(await secure.decrypt(hex(
      'd310000f000000002e925e42a356d9e0107805d087a97ea9e026448051d4351b004b02fabd8fd6',
    )))).toBe('424b0214020a20010005a100191234');
    expect(hexText(await secure.decrypt(hex(
      'd3100017000000011b69d724cbdeefcf515845c740287f33248869cb6c5eb9d01d6a56708dda649db78e29ed9ce47e',
    )))).toBe('424b0211010a2002000da30000010102a1646c616d70f5');
    secure.clear();
    await expect(secure.encrypt(hex('424b0212010a12340007a1646c616d70f4')))
      .rejects.toThrow('BLE_DIRECT_RECORD_INVALID');
  });

  it('reassembles the frozen 4-byte ATT fragments and rejects sequence gaps', () => {
    const fragments = [
      'b2110700d310001100000000450d5a4e8154ffa1',
      'b21007016feacf5f00e6b21a1bed8eef9583b370',
      'b212070205a91948d7518b1ebe',
    ].map(hex);
    const reassembler = new FragmentReassembler();
    expect(reassembler.push(fragments[0]!, 20)).toBeUndefined();
    expect(reassembler.push(fragments[1]!, 20)).toBeUndefined();
    expect(hexText(reassembler.push(fragments[2]!, 20)!)).toBe(
      'd310001100000000450d5a4e8154ffa16feacf5f00e6b21a1bed8eef9583b37005a91948d7518b1ebe',
    );
    expect(() => {
      const broken = new FragmentReassembler();
      broken.push(fragments[0]!, 20);
      const skipped = fragments[1]!.slice();
      skipped[3] = 2;
      broken.push(skipped, 20);
    }).toThrow('BLE_DIRECT_FRAGMENT_INVALID');
  });

  it('strictly decodes provisioning/direct advertisements and the signed grant shape', () => {
    const provisioning = decodeBleModeProfile(hex('01010107000102030405060708'));
    expect(provisioning.mode).toBe(BleApplicationMode.Provisioning);
    expect(hexText(provisioning.modeLocator)).toBe('0102030405060708');
    const direct = decodeBleModeProfile(hex('01020211000000000000000000'));
    expect(direct.mode).toBe(BleApplicationMode.Direct);
    const grant = decodeBleEnrollmentGrant(hex(
      'b200030150101112131415161718191a1b1c1d1e1f0250202122232425262728292a2b2c2d2e2f'
      + '0350303132333435363738393a3b3c3d3e3f045820404142434445464748494a4b4c4d4e4f'
      + '505152535455565758595a5b5c5d5e5f051a010203040650606162636465666768696a6b6c6d6e6f'
      + '075820707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f080f'
      + '091a050607080a5820a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9ba'
      + 'bbbcbdbeBF0b50909192939495969798999a9b9c9d9e9f0c1a6553f1000d1a6553f3580e010f011001'
      + '115840c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf'
      + 'e0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff',
    ));
    expect(grant.accessEpoch).toBe(0x01020304);
    expect(grant.controllerPermissions).toBe(0x0f);
    expect(grant.presenceKeyVersion).toBe(0x05060708);
  });

  it('keeps the raw controller secret outside the HTTP enrollment plane', async () => {
    let submitted: Record<string, unknown> | undefined;
    const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
    const http = {
      post: (_url: string, body: Record<string, unknown>) => {
        submitted = body;
        return of({
          status: 201,
          headers: { get: () => 'no-store' },
          body: {
            status: 201,
            data: {
              intentId: base64UrlEncode(bytes(16, 1)),
              logicalDeviceId: 'ble_AAAAAAAAAAAAAAAAAAAAAA',
              grant: base64UrlEncode(Uint8Array.of(1)),
              presenceKeyVersion: 1,
              presenceKey: base64UrlEncode(bytes(16, 8)),
              expiresAt: 1,
              securityProfile: 1,
              serverKeyId: 1,
              signatureAlgorithm: 2,
              replayed: false,
            },
          },
        });
      },
    };
    const api = new HttpBleEnrollmentApi(
      http as unknown as ConstructorParameters<typeof HttpBleEnrollmentApi>[0],
    );
    await api.issue({
      requestId: bytes(16, 1),
      displayName: 'Desk lamp',
      deviceInstanceId: bytes(16, 2),
      setupSessionId: bytes(16, 3),
      setupTranscriptHash: bytes(32, 4),
      accessEpoch: 1,
      controllerId: bytes(16, 5),
      controllerSecretDigest: bytes(32, 6),
      adminFingerprint: bytes(32, 7),
      securityProfile: 1,
      serverKeyId: 1,
      signatureAlgorithm: 2,
    });

    expect(submitted).toBeDefined();
    expect(submitted).not.toHaveProperty('controllerSecret');
    expect(submitted).toHaveProperty('controllerSecretDigest');
  });

  it('cancels an abandoned intent with an exact empty request', async () => {
    const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);
    const intentId = bytes(16, 1);
    let submittedUrl = '';
    let submittedBody: unknown;
    const http = {
      post: (url: string, body: unknown) => {
        submittedUrl = url;
        submittedBody = body;
        return of({
          status: 200,
          data: {
            intentId: base64UrlEncode(intentId),
            logicalDeviceId: 'ble_AAAAAAAAAAAAAAAAAAAAAA',
            deviceInstanceId: base64UrlEncode(bytes(16, 2)),
            accessEpoch: 1,
            controllerId: base64UrlEncode(bytes(16, 3)),
            state: 'cancelled',
            replayed: false,
          },
        });
      },
    };
    const api = new HttpBleEnrollmentApi(
      http as unknown as ConstructorParameters<typeof HttpBleEnrollmentApi>[0],
    );

    const result = await api.cancel(intentId);

    expect(submittedUrl).toContain('/ble-enrollment/intents/');
    expect(submittedUrl).toMatch(/\/cancel$/);
    expect(submittedBody).toEqual({});
    expect(result.state).toBe('cancelled');
  });
});
