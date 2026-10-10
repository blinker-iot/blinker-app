import { GatewayHttpError } from '../../model/response.model';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  encodeCanonicalByteString as b,
  encodeCanonicalMap as map,
  encodeCanonicalUnsigned as u,
} from '../../protocol/device-v2';
import { BleEnrollmentApi, BleEnrollmentIntentRequest } from './api';
import { BleDirectClient } from './client';
import { BleDirectSession } from './session';
import { BleControllerCredential, BleControllerCredentialStore } from './credential-store';
import { BleDirectCrypto, NoiseNnInitiator } from './crypto';
import { BleDirectRecordLink, BleDirectTarget } from './transport';
import {
  BleApplicationMode,
  LocalSecureRecordType,
  decodeControllerMutationReceipt,
  encodeControllerMutationReceipt,
  encodeLocalSecureRecord,
} from './wire';

const bytes = (size: number, value: number) => new Uint8Array(size).fill(value);

describe('BLE reconnect bootstrap hint boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  for (const fails of [false, true]) {
    it(`finishes the optional hint only after fresh synchronization ${fails ? 'fails' : 'completes'}`, async () => {
      const credential = { state: 'active', logicalDeviceId: 'ble_test', deviceInstanceId: bytes(16, 1),
        accessEpoch: 7, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
        credentialVersion: 1, permissions: 15 } as const;
      const link = { finishBootstrap: vi.fn(), disconnect: vi.fn() };
      const store = { load: vi.fn().mockResolvedValue(credential) };
      let settle!: () => void;
      const syncError = Error('STATE_FAILED');
      const synchronized = new Promise<void>((resolve, reject) => {
        settle = () => fails ? reject(syncError) : resolve();
      });
      const session = { synchronize: vi.fn(() => synchronized), close: vi.fn(async () => undefined) };
      const client = new BleDirectClient(link as unknown as BleDirectRecordLink,
        {} as BleEnrollmentApi, store as unknown as BleControllerCredentialStore);
      const connect = vi.spyOn(client as unknown as {
        connectWithCredential(): Promise<BleDirectSession>;
      }, 'connectWithCredential').mockResolvedValue(session as unknown as BleDirectSession);
      const target = {} as BleDirectTarget;
      const connecting = client.connect('ble_test', target);
      const result = connecting.catch(error => error);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(connect).toHaveBeenCalledOnce();
      expect(session.synchronize).toHaveBeenCalledOnce();
      expect(link.finishBootstrap).not.toHaveBeenCalled();
      settle();
      expect(await result).toBe(fails ? syncError : session);
      expect(link.finishBootstrap).toHaveBeenCalledOnce();
      expect(session.close).toHaveBeenCalledTimes(fails ? 1 : 0);
      expect(credential.controllerSecret.every(value => value === 0)).toBe(true);
      if (fails) expect(session.close.mock.invocationCallOrder[0])
        .toBeLessThan(link.finishBootstrap.mock.invocationCallOrder[0]!);
    });
  }
});

describe('BLE enrollment client commit boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [410, 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED', 8, true],
    [410, 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED', 7, false],
    [410, 'DEVICE_V2_BLE_ENROLLMENT_EXPIRED', 8, false],
    [403, 'DEVICE_V2_BLE_ENROLLMENT_OWNER_INACTIVE', 8, false],
    [503, 'DEVICE_V2_BLE_ENROLLMENT_UNAVAILABLE', 8, false],
  ] as const)('retired pending replacement: %s/%s with setup epoch %s', async (status, code, epoch, replaceable) => {
    const pending = { logicalDeviceId: 'ble_retired', intentId: bytes(16, 1), accessEpoch: 7,
      deviceInstanceId: bytes(16, 3), controllerSecret: bytes(32, 2), presenceKeys: [] };
    const store = { load: vi.fn().mockResolvedValue(pending), remove: vi.fn().mockResolvedValue(undefined) };
    const error = new GatewayHttpError({ httpStatus: status, code, message: 'Unavailable' });
    const api = { cancel: vi.fn().mockRejectedValue(error) };
    const client = new BleDirectClient({} as any, api as any, store as any);
    const result = (client as any).checkPendingEnrollment(pending.deviceInstanceId, epoch, {
      displayName: 'Test replacement', replacePendingLogicalDeviceId: pending.logicalDeviceId,
    });
    if (replaceable) {
      await expect(result).resolves.toBe(pending);
      expect(pending.controllerSecret).toEqual(bytes(32, 2));
    } else {
      await expect(result).rejects.toBe(error);
      expect(pending.controllerSecret.every(value => value === 0)).toBe(true);
    }
    expect(store.load).toHaveBeenCalledExactlyOnceWith(pending.logicalDeviceId);
    expect(store.remove).not.toHaveBeenCalled();
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith(pending.intentId);
  });

  it.each([
    [410, 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED'],
    [403, 'DEVICE_V2_BLE_ENROLLMENT_OWNER_INACTIVE'],
    [503, 'DEVICE_V2_BLE_ENROLLMENT_UNAVAILABLE'],
  ] as const)('commit HTTP %s closes Direct without activating or losing the pending record', async (status, code) => {
    const pending: BleControllerCredential = {
      state: 'pending', logicalDeviceId: 'ble_test', deviceInstanceId: bytes(16, 1),
      accessEpoch: 7, controllerId: bytes(16, 2), controllerSecret: bytes(32, 3),
      credentialVersion: 1, permissions: 15, intentId: bytes(16, 4), commitId: bytes(16, 5),
      receipt: bytes(32, 6), presenceKeys: [{ state: 'current', accessEpoch: 7, version: 1, key: bytes(16, 7) }],
    };
    const loaded = structuredClone(pending);
    let saved: BleControllerCredential | undefined;
    const store: BleControllerCredentialStore = {
      load: vi.fn().mockResolvedValue(loaded),
      save: vi.fn(async value => { saved = structuredClone(value); }), remove: vi.fn(),
      findPending: vi.fn(), listPending: vi.fn(), replacePresenceKeys: vi.fn(),
    };
    const error = new GatewayHttpError({ httpStatus: status, code, message: 'Enrollment unavailable' });
    const api: BleEnrollmentApi = { issue: vi.fn(), cancel: vi.fn(), commit: vi.fn().mockRejectedValue(error) };
    const session = { synchronize: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    const client = new BleDirectClient({} as BleDirectRecordLink, api, store);
    vi.spyOn(client as any, 'connectWithCredential').mockResolvedValue(session);
    await expect(client.resume(pending.logicalDeviceId, {
      profile: { mode: BleApplicationMode.Direct },
    } as BleDirectTarget)).rejects.toBe(error);
    expect(api.commit).toHaveBeenCalledOnce();
    expect(vi.mocked(api.commit).mock.calls[0].map(value => Array.from(value)))
      .toEqual([pending.intentId, pending.commitId, pending.receipt].map(value => Array.from(value)));
    expect(api.issue).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(session.synchronize).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledOnce();
    expect(saved).toEqual(structuredClone({ ...pending, method2Confirmed: true }));
    expect(vi.mocked(store.save).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.commit).mock.invocationCallOrder[0]!);
    expect(store.remove).not.toHaveBeenCalled();
    expect(loaded.controllerSecret.every(value => value === 0)).toBe(true);
    expect(loaded.presenceKeys![0].key.every(value => value === 0)).toBe(true);
    expect(pending.state).toBe('pending');
    expect(pending.controllerSecret).toEqual(bytes(32, 3));
  });

  it('closes an authenticated session if initial synchronization fails before the service can own it', async () => {
    const credential = { state: 'active', controllerSecret: bytes(32, 1), presenceKeys: [] };
    const client = new BleDirectClient({} as any, {} as any, { load: async () => credential } as any);
    const error = Error('INITIAL_STATE_FAILED'), session = {
      synchronize: vi.fn().mockRejectedValue(error), close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(client as any, 'connectWithCredential').mockResolvedValue(session);
    await expect(client.connect('ble_test', {} as BleDirectTarget)).rejects.toBe(error);
    expect(session.close).toHaveBeenCalledOnce(); expect(credential.controllerSecret).toEqual(bytes(32, 0));
  });

  it.each(['grantContext', 'receiptProof', 'receiptEpoch', 'exactReceipt'] as const)(
    'keeps %s on the correct side of durable save, Method 2 and cloud commit', async fault => {
      const crypto = new BleDirectCrypto();
      const instance = bytes(16, 0x21);
      const setup = bytes(16, 0x22);
      const locator = bytes(8, 0x23);
      const transcript = bytes(32, 0x24);
      const presenceKey = bytes(16, 0x25);
      const target: BleDirectTarget = {
        device: { deviceId: 'test-session-locator' },
        profile: { mode: BleApplicationMode.Provisioning, wireVersion: 1,
          capabilities: 7, modeLocator: locator },
      };
      let pending: BleControllerCredential | undefined;
      let temporarySecret: Uint8Array | undefined;
      const saved: BleControllerCredential[] = [];
      const store: BleControllerCredentialStore = {
        save: vi.fn(async value => {
          temporarySecret = value.controllerSecret;
          pending = structuredClone(value);
          saved.push(pending);
        }),
        load: vi.fn(), findPending: vi.fn(), listPending: vi.fn(),
        replacePresenceKeys: vi.fn(), remove: vi.fn(),
      };
      const api: BleEnrollmentApi = {
        issue: vi.fn(async (input: BleEnrollmentIntentRequest) => {
          const grant = map([
            [0, u(3)], [1, b(bytes(16, 0x31))], [2, b(instance)], [3, b(setup)],
            [4, b(fault === 'grantContext' ? bytes(32, 0x99) : input.setupTranscriptHash)],
            [5, u(7)], [6, b(input.controllerId)], [7, b(input.controllerSecretDigest)],
            [8, u(15)], [9, u(1)], [10, b(await crypto.sha256(presenceKey))],
            [11, b(bytes(16, 0x32))], [12, u(1000)], [13, u(1600)],
            [14, u(1)], [15, u(1)], [16, u(1)], [17, b(bytes(64, 0x33))],
          ]);
          return { intentId: input.requestId, logicalDeviceId: 'ble_test', grant,
            presenceKeyVersion: 1, presenceKey: presenceKey.slice(), expiresAt: 1600,
            securityProfile: 1, serverKeyId: 1, signatureAlgorithm: 1, replayed: false };
        }),
        commit: vi.fn(), cancel: vi.fn(),
      };
      const link: BleDirectRecordLink = {
        connect: vi.fn().mockResolvedValue(undefined),
        sendRecord: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        waitForMode: vi.fn().mockRejectedValue(new Error('METHOD_2_BOUNDARY')),
        receiveRecord: vi.fn()
          .mockResolvedValueOnce(encodeLocalSecureRecord(
            LocalSecureRecordType.ResponderHandshake, bytes(48, 1),
          ))
          .mockResolvedValueOnce(encodeLocalSecureRecord(
            LocalSecureRecordType.Transport, bytes(32, 2),
          )),
      };
      // Noise is a transport seam here, not a cryptographic fake passing as a
      // device. Existing frozen Noise vectors test its cryptography separately.
      const noise = {
        writeInitiator: vi.fn().mockResolvedValue(bytes(32, 3)),
        readResponder: vi.fn().mockResolvedValue(map([
          [0, u(2)], [1, u(2)], [2, u(1)], [3, b(instance)], [4, b(setup)],
          [5, b(locator)], [6, u(7)], [7, u(1)], [8, u(1)], [9, u(1)],
        ])),
        transcriptHash: () => transcript.slice(),
        encrypt: vi.fn().mockResolvedValue(bytes(32, 4)),
        decrypt: vi.fn(async () => {
          const receipt = decodeControllerMutationReceipt(pending!.receipt.slice());
          if (fault === 'receiptProof') receipt.proof[31] ^= 1;
          if (fault === 'receiptEpoch') receipt.accessEpoch ^= 1;
          return map([[0, u(2)], [1, u(4)], [2, u(2)],
            [3, b(encodeControllerMutationReceipt(receipt))]]);
        }),
        clear: vi.fn(),
      };
      vi.spyOn(NoiseNnInitiator, 'create')
        .mockResolvedValue(noise as unknown as NoiseNnInitiator);

      const error = fault === 'grantContext' ? 'BLE_DIRECT_GRANT_CONTEXT_MISMATCH'
        : fault === 'exactReceipt' ? 'METHOD_2_BOUNDARY' : 'BLE_DIRECT_RECEIPT_MISMATCH';
      await expect(new BleDirectClient(link, api, store, crypto)
        .enroll(target, { displayName: 'Test child' })).rejects.toThrow(error);
      expect(api.commit).not.toHaveBeenCalled();
      expect(link.disconnect).toHaveBeenCalled();
      expect(noise.clear).toHaveBeenCalled();
      if (fault === 'grantContext') {
        expect(store.save).not.toHaveBeenCalled();
        expect(link.sendRecord).toHaveBeenCalledTimes(1);
      } else {
        expect(store.save).toHaveBeenCalledTimes(fault === 'exactReceipt' ? 2 : 1);
        expect(pending?.state).toBe('pending');
        expect(pending?.method2Confirmed).toBeUndefined();
        expect(pending?.controllerSecret.some(byte => byte !== 0)).toBe(true);
        expect(temporarySecret?.every(byte => byte === 0)).toBe(true);
        expect(vi.mocked(store.save).mock.invocationCallOrder[0])
          .toBeLessThan(noise.encrypt.mock.invocationCallOrder[0]!);
      }
      if (fault === 'exactReceipt') {
        expect(saved[1]).toEqual(saved[0]);
        expect(vi.mocked(store.save).mock.invocationCallOrder[1])
          .toBeGreaterThan(noise.decrypt.mock.invocationCallOrder[0]!);
        expect(link.waitForMode).toHaveBeenCalledOnce();
        expect(vi.mocked(store.save).mock.invocationCallOrder[1])
          .toBeLessThan(vi.mocked(link.waitForMode).mock.invocationCallOrder[0]!);
      } else expect(link.waitForMode).not.toHaveBeenCalled();
    },
  );
});
