import {
  Bbp2MessageKind,
} from '../../protocol/device-v2';
import { BleEnrollmentApi } from './api';
import {
  BleControllerCredential,
  BleControllerCredentialStore,
  clearBleControllerCredentialSecrets,
} from './credential-store';
import {
  BleDirectCrypto,
  DirectSecureContext,
  DirectSecureInitiator,
  NoiseNnInitiator,
  NoisePattern,
  controllerAuthProof,
  constantTimeEqual,
} from './crypto';
import {
  BleDirectRecordLink,
  BleDirectTarget,
} from './transport';
import { matchesBlePresenceLocator } from './presence';
import { BleDirectSecureChannel } from './secure-channel';
import { BleDirectSession } from './session';
import {
  BleApplicationMode,
  ControllerMutationReceipt,
  LocalSecureRecordType,
  decodeBleEnrollmentGrant,
  decodeBleEnrollmentHelloResponse,
  decodeBleEnrollmentResponse,
  decodeControllerAuthAuthorized,
  decodeControllerAuthChallenge,
  decodeControllerMutationReceipt,
  decodeDirectDeviceHelloBody,
  decodeLocalSecureRecord,
  encodeBleEnrollmentHelloRequest,
  encodeBleEnrollmentRequest,
  encodeControllerAuthInit,
  encodeControllerAuthProof,
  encodeControllerMutationReceipt,
  encodeControllerReceiptTranscript,
  encodeDirectAppHelloBody,
  encodeLocalSecureRecord,
  localSecureNoisePrologue,
  makeBbp2Frame,
  parseBbp2Response,
  provisioningNoisePattern,
  sameBytes,
} from './wire';

const ADMIN_FINGERPRINT_DOMAIN = new TextEncoder()
  .encode('blinker/direct-admin/fingerprint/v1');
// Allow Android's initial GATT scheduling to settle before the application
// Noise handshake. This is not an SMP/pairing timeout.
const INITIAL_HANDSHAKE_WRITE_TIMEOUT_MS = 45_000;

export interface BleDirectEnrollmentOptions {
  displayName: string;
  psk?: Uint8Array;
}

export interface BleDirectEnrollmentResult {
  logicalDeviceId: string;
  session: BleDirectSession;
}

export interface BleDirectEnrollmentObserver {
  pendingCredentialSaved(logicalDeviceId: string): Promise<void>;
}

export class BleDirectClient {
  constructor(
    private readonly link: BleDirectRecordLink,
    private readonly api: BleEnrollmentApi,
    private readonly store: BleControllerCredentialStore,
    private readonly crypto = new BleDirectCrypto(),
  ) {}

  async enroll(
    target: BleDirectTarget,
    options: BleDirectEnrollmentOptions,
    observer?: BleDirectEnrollmentObserver,
  ): Promise<BleDirectEnrollmentResult> {
    if (target.profile.mode !== BleApplicationMode.Provisioning) {
      throw new Error('BLE_DIRECT_PROVISIONING_MODE_REQUIRED');
    }
    const displayName = options.displayName.trim();
    if (!displayName || displayName !== options.displayName
      || displayName.includes('\0') || new TextEncoder().encode(displayName).length > 128) {
      throw new Error('BLE_DIRECT_DISPLAY_NAME_INVALID');
    }
    const pattern = provisioningNoisePattern(target.profile);
    if (pattern !== NoisePattern.Nn || options.psk) {
      throw new Error('BLE_DIRECT_PRODUCT_OOB_NOT_ENABLED');
    }

    let noise: NoiseNnInitiator | undefined;
    let controllerSecret: Uint8Array | undefined;
    let presenceKey: Uint8Array | undefined;
    let directSession: BleDirectSession | undefined;
    try {
      await this.link.connect(target);
      noise = await NoiseNnInitiator.create(
        this.crypto, pattern, localSecureNoisePrologue(pattern), options.psk,
      );
      const firstMessage = await noise.writeInitiator(encodeBleEnrollmentHelloRequest());
      await this.link.sendRecord(encodeLocalSecureRecord(
        LocalSecureRecordType.InitiatorHandshake, firstMessage,
      ), INITIAL_HANDSHAKE_WRITE_TIMEOUT_MS);
      const responder = decodeLocalSecureRecord(
        await this.link.receiveRecord(), LocalSecureRecordType.ResponderHandshake,
      );
      const hello = decodeBleEnrollmentHelloResponse(await noise.readResponder(responder));
      if (!sameBytes(hello.setupSessionLocator, target.profile.modeLocator)
        || hello.securityProfile !== 1) {
        throw new Error('BLE_DIRECT_SETUP_CONTEXT_MISMATCH');
      }
      await this.cancelPending(hello.deviceInstanceId);

      const controllerId = this.crypto.random(16);
      controllerSecret = this.crypto.random(32);
      const intentId = this.crypto.random(16);
      const commitId = this.crypto.random(16);
      const secretDigest = await this.crypto.sha256(controllerSecret);
      const adminFingerprint = await this.adminFingerprint(controllerId, controllerSecret);
      const transcriptHash = noise.transcriptHash();
      const intent = await this.api.issue({
        requestId: intentId,
        displayName,
        deviceInstanceId: hello.deviceInstanceId,
        setupSessionId: hello.setupSessionId,
        setupTranscriptHash: transcriptHash,
        accessEpoch: hello.accessEpoch,
        controllerId,
        controllerSecretDigest: secretDigest,
        adminFingerprint,
        securityProfile: hello.securityProfile,
        serverKeyId: hello.serverKeyId,
        signatureAlgorithm: hello.signatureAlgorithm,
      });
      if (!sameBytes(intent.intentId, intentId)
        || intent.securityProfile !== hello.securityProfile
        || intent.serverKeyId !== hello.serverKeyId
        || intent.signatureAlgorithm !== hello.signatureAlgorithm) {
        throw new Error('BLE_DIRECT_INTENT_CONTEXT_MISMATCH');
      }
      const grant = decodeBleEnrollmentGrant(intent.grant);
      presenceKey = intent.presenceKey;
      const presenceKeyDigest = await this.crypto.sha256(presenceKey);
      this.validateGrant(
        grant, hello, transcriptHash, controllerId, secretDigest,
        intent.presenceKeyVersion, presenceKeyDigest,
      );
      presenceKeyDigest.fill(0);
      const expectedReceipt = await this.expectedReceipt(
        grant, controllerSecret, secretDigest,
      );
      let credential: BleControllerCredential = {
        state: 'pending',
        logicalDeviceId: intent.logicalDeviceId,
        deviceInstanceId: hello.deviceInstanceId,
        accessEpoch: hello.accessEpoch,
        controllerId,
        controllerSecret,
        credentialVersion: 1,
        permissions: grant.controllerPermissions,
        presenceKeys: [{
          state: 'current',
          accessEpoch: grant.accessEpoch,
          version: grant.presenceKeyVersion,
          key: presenceKey,
        }],
        intentId,
        commitId,
        receipt: expectedReceipt.encoded,
      };
      await this.store.save(credential);
      await observer?.pendingCredentialSaved(intent.logicalDeviceId);

      const encryptedRequest = await noise.encrypt(encodeBleEnrollmentRequest(
        intent.grant, controllerSecret, presenceKey,
      ));
      await this.link.sendRecord(encodeLocalSecureRecord(
        LocalSecureRecordType.Transport, encryptedRequest,
      ));
      const encryptedResponse = decodeLocalSecureRecord(
        await this.link.receiveRecord(), LocalSecureRecordType.Transport,
      );
      const receiptBytes = decodeBleEnrollmentResponse(await noise.decrypt(encryptedResponse));
      const receipt = decodeControllerMutationReceipt(receiptBytes);
      if (!constantTimeEqual(receipt.encoded, expectedReceipt.encoded)) {
        throw new Error('BLE_DIRECT_RECEIPT_MISMATCH');
      }

      noise.clear();
      noise = undefined;
      await this.link.disconnect();
      const directTarget = await this.link.waitForMode(
        BleApplicationMode.Direct,
        undefined,
        candidate => candidate.profile.wireVersion === 3
          && matchesBlePresenceLocator(presenceKey!, {
            deviceInstanceId: hello.deviceInstanceId,
            accessEpoch: grant.accessEpoch,
            presenceKeyVersion: grant.presenceKeyVersion,
          }, candidate.profile.modeLocator, this.crypto),
      );
      await this.link.connect(directTarget);
      directSession = await this.authenticate(intent.logicalDeviceId, credential);
      await this.commit(credential);
      credential = {
        ...credential,
        state: 'active',
      };
      await this.store.save(credential);
      await directSession.synchronize();
      controllerSecret.fill(0);
      controllerSecret = undefined;
      presenceKey.fill(0);
      presenceKey = undefined;
      return {
        logicalDeviceId: intent.logicalDeviceId,
        session: directSession,
      };
    } catch (error) {
      noise?.clear();
      controllerSecret?.fill(0);
      presenceKey?.fill(0);
      if (directSession) await directSession.close().catch(() => undefined);
      else await this.link.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async connect(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectSession> {
    const credential = await this.requireCredential(logicalDeviceId);
    try {
      if (credential.state !== 'active') throw new Error('BLE_DIRECT_ENROLLMENT_PENDING');
      const session = await this.connectWithCredential(credential, target);
      await session.synchronize();
      return session;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  async connectEphemeral(
    logicalDeviceId: string,
    target: BleDirectTarget,
    credential: BleDirectAuthenticationCredential,
  ): Promise<BleDirectSession> {
    validateAuthenticationCredential(credential);
    try {
      const session = await this.connectWithCredential(
        { ...credential, logicalDeviceId }, target,
      );
      await session.synchronize();
      return session;
    } catch (error) {
      await this.link.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async resume(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectEnrollmentResult> {
    let credential = await this.requireCredential(logicalDeviceId);
    let session: BleDirectSession | undefined;
    try {
      if (target.profile.mode !== BleApplicationMode.Direct) {
        throw new Error('BLE_DIRECT_RECOVERY_REQUIRES_INSTALLED_DEVICE');
      }
      session = await this.connectWithCredential(credential, target);
      await this.commit(credential);
      credential = { ...credential, state: 'active' };
      await this.store.save(credential);
      await session.synchronize();
      return {
        logicalDeviceId,
        session,
      };
    } catch (error) {
      if (session) await session.close().catch(() => undefined);
      else await this.link.disconnect().catch(() => undefined);
      throw error;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  private async connectWithCredential(
    credential: BleDirectAuthenticationCredential & { logicalDeviceId: string },
    target: BleDirectTarget,
  ): Promise<BleDirectSession> {
    if (target.profile.mode !== BleApplicationMode.Direct) {
      throw new Error('BLE_DIRECT_TARGET_MISMATCH');
    }
    try {
      await this.link.connect(target);
      const session = await this.authenticate(credential.logicalDeviceId, credential);
      return session;
    } catch (error) {
      await this.link.disconnect().catch(() => undefined);
      throw error;
    }
  }

  private async authenticate(
    logicalDeviceId: string,
    credential: BleDirectAuthenticationCredential,
  ): Promise<BleDirectSession> {
    let sequence = 1;
    await this.link.sendRecord(makeBbp2Frame(
      Bbp2MessageKind.Hello, sequence, encodeDirectAppHelloBody(),
    ));
    const helloFrame = parseBbp2Response(
      await this.link.receiveRecord(), Bbp2MessageKind.Hello, sequence,
    );
    const hello = decodeDirectDeviceHelloBody(helloFrame.body);
    const maxFrameSize = Math.min(512, hello.maxFrameSize, hello.maxReassemblySize);

    const clientNonce = this.crypto.random(16);
    sequence += 1;
    await this.link.sendRecord(makeBbp2Frame(
      Bbp2MessageKind.Authenticate,
      sequence,
      encodeControllerAuthInit(
        credential.controllerId,
        credential.accessEpoch,
        credential.credentialVersion,
        clientNonce,
      ),
    ));
    const challengeFrame = parseBbp2Response(
      await this.link.receiveRecord(), Bbp2MessageKind.AuthResult, sequence,
    );
    const challenge = decodeControllerAuthChallenge(challengeFrame.body);
    if (challenge.permissions !== credential.permissions) {
      throw new Error('BLE_DIRECT_AUTH_PERMISSIONS_MISMATCH');
    }
    const context: DirectSecureContext = {
      controllerId: credential.controllerId,
      domain: 2,
      accessEpoch: credential.accessEpoch,
      credentialVersion: credential.credentialVersion,
      permissions: challenge.permissions,
      clientNonce,
      deviceNonce: challenge.deviceNonce,
    };
    const expectedDeviceProof = await controllerAuthProof(
      this.crypto, credential.controllerSecret, context, 'device',
    );
    if (!constantTimeEqual(expectedDeviceProof, challenge.deviceProof)) {
      throw new Error('BLE_DIRECT_DEVICE_PROOF_INVALID');
    }
    const appProof = await controllerAuthProof(
      this.crypto, credential.controllerSecret, context, 'app',
    );
    sequence += 1;
    await this.link.sendRecord(makeBbp2Frame(
      Bbp2MessageKind.Authenticate,
      sequence,
      encodeControllerAuthProof(appProof),
    ));
    const authorizedFrame = parseBbp2Response(
      await this.link.receiveRecord(), Bbp2MessageKind.AuthResult, sequence,
    );
    decodeControllerAuthAuthorized(authorizedFrame.body);
    const secure = await DirectSecureInitiator.create(
      this.crypto, credential.controllerSecret, context,
    );
    return new BleDirectSession(new BleDirectSecureChannel(
      logicalDeviceId,
      this.link,
      secure,
      maxFrameSize,
      sequence,
    ));
  }

  private async expectedReceipt(
    grant: ReturnType<typeof decodeBleEnrollmentGrant>,
    controllerSecret: Uint8Array,
    secretDigest: Uint8Array,
  ): Promise<ControllerMutationReceipt> {
    const partial: ControllerMutationReceipt = {
      encoded: new Uint8Array(),
      operation: 1,
      grantId: grant.grantId,
      deviceInstanceId: grant.deviceInstanceId,
      accessEpoch: grant.accessEpoch,
      controllerId: grant.controllerId,
      credentialVersion: 1,
      permissions: grant.controllerPermissions,
      secretDigest,
      proofKind: 1,
      proof: new Uint8Array(),
    };
    partial.proof = await this.crypto.hmac(
      controllerSecret, encodeControllerReceiptTranscript(partial),
    );
    partial.encoded = encodeControllerMutationReceipt(partial);
    return partial;
  }

  private validateGrant(
    grant: ReturnType<typeof decodeBleEnrollmentGrant>,
    hello: ReturnType<typeof decodeBleEnrollmentHelloResponse>,
    transcriptHash: Uint8Array,
    controllerId: Uint8Array,
    secretDigest: Uint8Array,
    presenceKeyVersion: number,
    presenceKeyDigest: Uint8Array,
  ): void {
    if (!sameBytes(grant.deviceInstanceId, hello.deviceInstanceId)
      || !sameBytes(grant.setupSessionId, hello.setupSessionId)
      || !sameBytes(grant.setupTranscriptHash, transcriptHash)
      || grant.accessEpoch !== hello.accessEpoch
      || !sameBytes(grant.controllerId, controllerId)
      || !sameBytes(grant.controllerSecretDigest, secretDigest)
      || grant.presenceKeyVersion !== presenceKeyVersion
      || !sameBytes(grant.presenceKeyDigest, presenceKeyDigest)
      || grant.securityProfile !== hello.securityProfile
      || grant.serverKeyId !== hello.serverKeyId
      || grant.signatureAlgorithm !== hello.signatureAlgorithm) {
      throw new Error('BLE_DIRECT_GRANT_CONTEXT_MISMATCH');
    }
  }

  private async adminFingerprint(
    controllerId: Uint8Array,
    controllerSecret: Uint8Array,
  ): Promise<Uint8Array> {
    const version = new Uint8Array(4);
    new DataView(version.buffer).setUint32(0, 1, false);
    return this.crypto.sha256(
      ADMIN_FINGERPRINT_DOMAIN,
      Uint8Array.of(0),
      controllerId,
      version,
      controllerSecret,
    );
  }

  private async commit(credential: BleControllerCredential): Promise<void> {
    const result = await this.api.commit(
      credential.intentId, credential.commitId, credential.receipt,
    );
    if (result.logicalDeviceId !== credential.logicalDeviceId
      || result.accessEpoch !== credential.accessEpoch
      || (credential.presenceKeys !== undefined
        && result.presenceKeyVersion !== credential.presenceKeys.find(
          value => value.state === 'current',
        )?.version)
      || !sameBytes(result.controllerId, credential.controllerId)
      || result.state !== 'active') {
      throw new Error('BLE_DIRECT_COMMIT_CONTEXT_MISMATCH');
    }
  }

  private async cancelPending(deviceInstanceId: Uint8Array): Promise<void> {
    const credential = await this.store.findPending(deviceInstanceId);
    if (!credential) return;
    try {
      const result = await this.api.cancel(credential.intentId);
      if (!sameBytes(result.intentId, credential.intentId)
        || result.logicalDeviceId !== credential.logicalDeviceId
        || !sameBytes(result.deviceInstanceId, credential.deviceInstanceId)
        || result.accessEpoch !== credential.accessEpoch
        || !sameBytes(result.controllerId, credential.controllerId)) {
        throw new Error('BLE_DIRECT_CANCEL_CONTEXT_MISMATCH');
      }
      await this.store.remove(credential.logicalDeviceId);
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  private async requireCredential(logicalDeviceId: string): Promise<BleControllerCredential> {
    const credential = await this.store.load(logicalDeviceId);
    if (!credential) throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    return credential;
  }
}

export interface BleDirectAuthenticationCredential {
  accessEpoch: number;
  controllerId: Uint8Array;
  controllerSecret: Uint8Array;
  credentialVersion: number;
  permissions: number;
}

function validateAuthenticationCredential(value: BleDirectAuthenticationCredential): void {
  if (!Number.isSafeInteger(value.accessEpoch) || value.accessEpoch < 1
    || value.accessEpoch > 0xffffffff
    || !Number.isSafeInteger(value.credentialVersion) || value.credentialVersion < 1
    || value.credentialVersion > 0xffffffff
    || !Number.isSafeInteger(value.permissions) || value.permissions < 1
    || value.permissions > 0x0f
    || value.controllerId.length !== 16 || !value.controllerId.some(byte => byte !== 0)
    || value.controllerSecret.length !== 32
    || !value.controllerSecret.some(byte => byte !== 0)) {
    throw new Error('BLE_DIRECT_AUTH_CREDENTIAL_INVALID');
  }
}
