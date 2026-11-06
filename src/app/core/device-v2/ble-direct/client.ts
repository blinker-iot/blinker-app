import { decodeDirectDeviceHelloBody, encodeDirectAppHelloBody } from '../../protocol/device-v2/direct-hello';
import {
  Bbp2FrameFlag,
  Bbp2MessageKind,
  DeviceV2Manifest,
} from '../../protocol/device-v2';
import { BleEnrollmentApi } from './api';
import { GatewayHttpError } from '../../model/response.model';
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
import { BleDirectSecureChannel, InitialCloudPurpose, InitialCloudWrite } from './secure-channel';
import { BleDirectSession } from './session';
import { AccessRegistrationIntent, accessRegistrationConfirmationDigest,
  validateAccessRegistrationIntent } from './access-registration-contract';
import { CloudRegistrationConfirmation, ConfirmCloudRegistration, IssuedCloudRegistration, assertCloudRegistrationCommitted,
  cloudRegistrationCommitRequest, confirmInitialCloudKeyAck, encodeInitialCloudKeyInstall, encodeInitialCloudWifiHandoff,
  snapshotIssuedCloudRegistration, verifyIssuedCloudRegistrationKey } from './cloud-registration-wire';
import { deriveInitialCloudWifiCredentials, deriveInitialCloudNetworkWifiCredentials,
  holdInitialCloudWifiCarrier, InitialCloudWifiCarrierConsumer } from './cloud-registration-carrier';
import { InstalledKeyInitialNetworkAcceptance, InstalledKeyInitialNetworkOperation,
  confirmInitialCloudNetworkAcceptance, encodeInitialCloudNetworkHandoff,
  snapshotInstalledKeyInitialNetwork } from './initial-cloud-network-wire';
import { InitialCloudNetworkRecoverySession } from './initial-cloud-network-session';
import {
  BleApplicationMode,
  base64UrlDecode,
  base64UrlEncode,
  ControllerMutationReceipt,
  LocalSecureRecordType,
  decodeBleEnrollmentGrant,
  decodeBleEnrollmentHelloResponse,
  decodeBleEnrollmentResponse,
  decodeControllerAuthAuthorized,
  decodeControllerAuthChallenge,
  decodeControllerMutationReceipt,
  decodeLocalSecureRecord,
  encodeBleEnrollmentHelloRequest,
  encodeBleEnrollmentRequest,
  encodeControllerAuthInit,
  encodeControllerAuthProof,
  encodeControllerMutationReceipt,
  encodeControllerReceiptTranscript,
  encodeLocalSecureRecord,
  localSecureNoisePrologue,
  makeBbp2Frame,
  parseBbp2Response,
  provisioningNoisePattern,
  sameBytes,
} from './wire';

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

interface RegistrationAuthentication {
  clientNonce: Uint8Array;
  check(): void;
  confirmed(context: DirectSecureContext, secure: DirectSecureInitiator): Promise<void>;
  checkInitialCloudWrite?: (kind: InitialCloudWrite) => void;
  initialCloudPurpose?: InitialCloudPurpose;
}

export interface InitialCloudRegistrationOwner {
  signal: AbortSignal;
  assertCurrent(): void;
  /** Optional tighter live admission bound; never used to erase a late ACK. */
  writeDeadline?: number;
  // Must settle the caller's once-only issued/attempt checkpoint before any
  // native mutation. This consumer does not create another journal or retry.
  beforeWrite(): Promise<void>;
}

export interface InitialCloudRegistrationInstallation {
  confirmation: CloudRegistrationConfirmation;
  /** One-way submission, then optional bounded use on an independently verified candidate carrier. */
  submitWifiHandoff(commitId: string, confirm: ConfirmCloudRegistration): Promise<void>;
  submitWifiHandoff<T>(commitId: string, confirm: ConfirmCloudRegistration, useCarrier: InitialCloudWifiCarrierConsumer<T>): Promise<T>;
  close(): Promise<void>;
}

export interface InitialCloudNetworkOwner extends InitialCloudRegistrationOwner {}

export interface InstalledKeyInitialNetworkHandoff {
  /** Authenticated authorization acceptance, not WiFi persistence or Cloud online. */
  readonly acceptance: InstalledKeyInitialNetworkAcceptance;
  useWifiCarrier<T>(consumer: InitialCloudWifiCarrierConsumer<T>): Promise<T>;
  close(): Promise<void>;
}

class InitialCloudRegistrationSession extends BleDirectSession {
  private used = false;

  constructor(private readonly registrationChannel: BleDirectSecureChannel) { super(registrationChannel); }

  installInitialCloudKey(body: Uint8Array): Promise<Uint8Array> {
    if (this.used) return Promise.reject(Error('CLOUD_REGISTRATION_ATTEMPT_CONSUMED'));
    this.used = true;
    return this.enqueue(async () => (await this.exchange(
      Bbp2MessageKind.InitialCloudKeyInstall, 0, body,
      Bbp2MessageKind.InitialCloudKeyReceipt, Bbp2FrameFlag.IsResponse,
    )).body); // Deliberately no AckRequired: the generic reliable lane retries.
  }

  submitWifiHandoff(body: Uint8Array): Promise<void> {
    return this.enqueue(() => this.registrationChannel.send(this.registrationChannel.createFrame(
      Bbp2MessageKind.InitialCloudWifiHandoff, 0, body,
    ))); // No protocol response or retransmission in this purpose.
  }
}

export class BleDirectClient {
  private initialCloudPurposeUsed = false;

  constructor(
    private readonly link: BleDirectRecordLink,
    private readonly api: BleEnrollmentApi,
    private readonly store: BleControllerCredentialStore,
    private readonly crypto = new BleDirectCrypto(),
    private readonly loadManifest?: (logicalDeviceId: string) => DeviceV2Manifest | undefined,
  ) {}

  // Separate single-use owner for a Key already installed in the exact root.
  // The coordinator persists its NEW operation before dispatch; no old install
  // intent, Key material, service commit, retry or ordinary Direct session leaks.
  async requestInstalledKeyInitialNetwork(value: InstalledKeyInitialNetworkOperation,
    target: BleDirectTarget, owner: InitialCloudNetworkOwner): Promise<InstalledKeyInitialNetworkHandoff> {
    const operation = snapshotInstalledKeyInitialNetwork(value);
    const signal = owner.signal, assertCurrent = owner.assertCurrent.bind(owner);
    const deadline = Math.min(operation.expiresAt, owner.writeDeadline ?? operation.expiresAt, Date.now() + 120_000);
    if (!Number.isSafeInteger(deadline) || deadline <= 0 || typeof owner.beforeWrite !== 'function')
      throw Error('INITIAL_CLOUD_NETWORK_CONTEXT_INVALID');
    const beforeWrite = owner.beforeWrite.bind(owner);
    const assertOwner = () => { signal.throwIfAborted(); assertCurrent(); };
    const check = () => { assertOwner(); if (Date.now() >= deadline) throw Error('INITIAL_CLOUD_NETWORK_CLOSED'); };
    check();
    if (target.profile.mode !== BleApplicationMode.Direct) throw Error('ACCESS_REGISTRATION_DIRECT_REQUIRED');
    const peer = { ...target, device: { ...target.device },
      profile: { ...target.profile, modeLocator: target.profile.modeLocator.slice() } };
    if (this.initialCloudPurposeUsed) throw Error('INITIAL_CLOUD_NETWORK_ATTEMPT_CONSUMED');
    this.initialCloudPurposeUsed = true;
    let credential: BleControllerCredential | undefined, session: BleDirectSession | undefined;
    let carrier: ReturnType<typeof holdInitialCloudWifiCarrier> | undefined;
    let acquiring = false, dispatched = false, retained = false, retired = false, carrierUsed = false;
    const closeGatt = () => session ? session.close() : this.link.disconnect();
    const abort = () => { retired = true; carrier?.close(); void closeGatt().catch(() => undefined); };
    const releaseGatt = () => {
      retired = true;
      signal.removeEventListener('abort', abort);
      return closeGatt();
    };
    const close = () => { carrier?.close(); return releaseGatt(); };
    try {
      credential = await this.requireCredential(operation.sourceLogicalDeviceId); check();
      const root = operation.expectedRoot;
      if (credential.state !== 'active' || (credential.source ?? 'enrollment') !== 'enrollment'
        || credential.logicalDeviceId !== operation.sourceLogicalDeviceId || credential.cloudContext !== undefined
        || credential.keyRotation !== undefined || credential.permissions !== 15
        || credential.accessEpoch !== root.accessEpoch || credential.credentialVersion !== root.credentialVersion
        || base64UrlEncode(credential.deviceInstanceId) !== root.deviceInstanceId
        || base64UrlEncode(credential.controllerId) !== root.controllerId) throw Error('INITIAL_CLOUD_NETWORK_ROOT_CHANGED');
      validateAuthenticationCredential(credential);
      const fingerprint = await this.crypto.adminFingerprint(credential.controllerId, credential.controllerSecret, credential.credentialVersion);
      try { if (!constantTimeEqual(fingerprint, base64UrlDecode(root.adminFingerprint, 32))) throw Error('INITIAL_CLOUD_NETWORK_ROOT_CHANGED'); }
      finally { fingerprint.fill(0); }
      check(); signal.addEventListener('abort', abort, { once: true });
      acquiring = true;
      await this.link.connect(peer); check();
      const clientNonce = this.crypto.random(16);
      try {
        session = await this.authenticate(operation.targetLogicalDeviceId, credential, {
          clientNonce, check, initialCloudPurpose: 'installed-key-network',
          checkInitialCloudWrite: kind => {
            check();
            if (retired || dispatched || kind !== Bbp2MessageKind.InitialCloudNetworkHandoff)
              throw Error('INITIAL_CLOUD_NETWORK_ATTEMPT_CONSUMED');
            dispatched = true;
          },
          confirmed: async (_context, secure) => {
            const binding = secure.copyRegistrationBinding();
            try {
              const credentials = await deriveInitialCloudNetworkWifiCredentials(
                this.crypto, credential!.controllerSecret, operation, binding);
              carrier = holdInitialCloudWifiCarrier(credentials, deadline, signal, assertOwner);
            } finally { binding.fill(0); }
          },
        });
      } finally { clientNonce.fill(0); }
      clearBleControllerCredentialSecrets(credential); credential = undefined;
      check();
      if (!(session instanceof InitialCloudNetworkRecoverySession) || !carrier)
        throw Error('INITIAL_CLOUD_NETWORK_AUTH_CONTEXT_MISSING');
      await beforeWrite(); check();
      const body = await session.requestNetworkHandoff(encodeInitialCloudNetworkHandoff(operation));
      if (!dispatched) throw Error('INITIAL_CLOUD_NETWORK_ACK_INVALID');
      // A real late ACK remains acceptance evidence. Expiry still blocks the
      // subsequent carrier; it must not relabel an observed response UNKNOWN.
      const acceptance = confirmInitialCloudNetworkAcceptance(operation, body);
      assertOwner();
      retained = true;
      const acceptedCarrier = carrier;
      return { acceptance, close, useWifiCarrier: async <T>(consume: InitialCloudWifiCarrierConsumer<T>) => {
        if (carrierUsed) throw Error('INITIAL_CLOUD_NETWORK_CARRIER_CONSUMED');
        carrierUsed = true;
        try {
          check();
          if (retired) throw Error('INITIAL_CLOUD_NETWORK_RETIRED');
          await releaseGatt();
          assertOwner();
          return await acceptedCarrier.use(consume);
        } finally {
          acceptedCarrier.close();
          await releaseGatt().catch(() => undefined);
        }
      } };
    } catch (error) {
      carrier?.close();
      if (acquiring) await closeGatt().catch(() => undefined);
      if (dispatched) throw Error('INITIAL_CLOUD_NETWORK_HANDOFF_UNKNOWN');
      throw error;
    } finally {
      if (credential) clearBleControllerCredentialSecrets(credential);
      if (!retained) { carrier?.close(); signal.removeEventListener('abort', abort); }
      if (acquiring) try { this.link.finishBootstrap?.(); } catch { /* Optional carrier hint. */ }
    }
  }

  // Explicit PreCloudDirect consumer on a NEW, exclusive client/link using the
  // caller's original radio admission. Never reuse that link across owners.
  // Failure cleanup or closing this GATT is NOT a WiFiProv handoff permit.
  async installInitialCloudRegistrationKey(
    value: IssuedCloudRegistration, deviceKey: Uint8Array, target: BleDirectTarget, owner: InitialCloudRegistrationOwner,
  ): Promise<InitialCloudRegistrationInstallation> {
    const intent = snapshotIssuedCloudRegistration(value);
    const signal = owner.signal, assertCurrent = owner.assertCurrent.bind(owner);
    const deadline = Math.min(intent.expiresAt, owner.writeDeadline ?? intent.expiresAt);
    if (!Number.isSafeInteger(deadline) || deadline <= 0) throw Error('CLOUD_REGISTRATION_CONTEXT_INVALID');
    const assertOwner = () => { signal.throwIfAborted(); assertCurrent(); };
    const checkDeadline = () => {
      if (Date.now() >= deadline) throw Error('CLOUD_REGISTRATION_CLOSED');
    };
    const check = () => { assertOwner(); checkDeadline(); };
    check();
    if (target.profile.mode !== BleApplicationMode.Direct) throw Error('ACCESS_REGISTRATION_DIRECT_REQUIRED');
    if (!(deviceKey instanceof Uint8Array) || deviceKey.length !== 32 || typeof owner.beforeWrite !== 'function')
      throw Error('CLOUD_REGISTRATION_CONTEXT_INVALID');
    const beforeWrite = owner.beforeWrite.bind(owner);
    const peer = { ...target, device: { ...target.device },
      profile: { ...target.profile, modeLocator: target.profile.modeLocator.slice() } };
    if (this.initialCloudPurposeUsed) throw Error('CLOUD_REGISTRATION_ATTEMPT_CONSUMED');
    this.initialCloudPurposeUsed = true;
    const candidate = deviceKey.slice();
    let credential: BleControllerCredential | undefined, session: BleDirectSession | undefined;
    let body: Uint8Array | undefined, binding: Uint8Array | undefined, deviceNonce: Uint8Array | undefined;
    let carrier: ReturnType<typeof holdInitialCloudWifiCarrier> | undefined;
    let acquiring = false, dispatched = false, retained = false;
    let retired = false, handoffAttempted = false, handoffAuthorized = false, handoffDispatched = false;
    const handoffStop = new AbortController();
    const assertHandoffLive = () => {
      if (retired || session?.state !== 'ready') throw Error('CLOUD_REGISTRATION_HANDOFF_RETIRED');
      assertOwner();
    };
    const close = () => session ? session.close() : this.link.disconnect();
    const abort = () => { retired = true; handoffStop.abort(); carrier?.close(); void close().catch(() => undefined); };
    const clear = () => {
      if (credential) clearBleControllerCredentialSecrets(credential);
      candidate.fill(0); body?.fill(0); binding?.fill(0); deviceNonce?.fill(0);
    };
    try {
      await verifyIssuedCloudRegistrationKey(this.crypto, intent, candidate); check();
      credential = await this.requireCredential(intent.sourceLogicalDeviceId); check();
      const root = intent.expectedRoot;
      if (credential.state !== 'active' || (credential.source ?? 'enrollment') !== 'enrollment'
        || credential.logicalDeviceId !== intent.sourceLogicalDeviceId || credential.cloudContext !== undefined
        || credential.keyRotation !== undefined || credential.permissions !== 15
        || credential.accessEpoch !== root.accessEpoch || credential.credentialVersion !== root.credentialVersion
        || base64UrlEncode(credential.deviceInstanceId) !== root.deviceInstanceId
        || base64UrlEncode(credential.controllerId) !== root.controllerId) throw Error('CLOUD_REGISTRATION_ROOT_CHANGED');
      validateAuthenticationCredential(credential);
      const fingerprint = await this.crypto.adminFingerprint(credential.controllerId, credential.controllerSecret, credential.credentialVersion);
      try { if (!constantTimeEqual(fingerprint, base64UrlDecode(root.adminFingerprint, 32))) throw Error('CLOUD_REGISTRATION_ROOT_CHANGED'); }
      finally { fingerprint.fill(0); }
      check(); signal.addEventListener('abort', abort, { once: true });
      acquiring = true;
      await this.link.connect(peer); check();
      session = await this.authenticate(intent.targetLogicalDeviceId, credential, {
        clientNonce: base64UrlDecode(intent.clientNonce, 16), check,
        checkInitialCloudWrite: kind => {
          if (kind === Bbp2MessageKind.InitialCloudKeyInstall) { check(); dispatched = true; return; }
          assertHandoffLive(); checkDeadline();
          if (!handoffAuthorized || handoffDispatched) throw Error('CLOUD_REGISTRATION_HANDOFF_INVALID');
          handoffDispatched = true;
        },
        confirmed: async (context, secure) => {
          binding = secure.copyRegistrationBinding();
          deviceNonce = context.deviceNonce.slice();
          body = await encodeInitialCloudKeyInstall(this.crypto, intent, context, binding, credential!.controllerSecret, candidate);
          const credentials = await deriveInitialCloudWifiCredentials(this.crypto, credential!.controllerSecret, intent, binding);
          carrier = holdInitialCloudWifiCarrier(credentials, deadline, signal, assertOwner);
        },
      });
      candidate.fill(0); clearBleControllerCredentialSecrets(credential); credential = undefined;
      check();
      if (!(session instanceof InitialCloudRegistrationSession) || !body || !binding || !deviceNonce || !carrier)
        throw Error('CLOUD_REGISTRATION_AUTH_CONTEXT_MISSING');
      await beforeWrite(); check();
      const ack = await session.installInitialCloudKey(body);
      if (!dispatched) throw Error('CLOUD_REGISTRATION_ACK_INVALID');
      // TTL bounds the write only; it cannot invalidate an actual late ACK.
      const confirmation = await confirmInitialCloudKeyAck(this.crypto, intent, binding, deviceNonce, ack);
      assertOwner();
      const installed = session;
      const installedCarrier = carrier;
      retained = true;
      const releaseGatt = () => {
        retired = true;
        handoffStop.abort();
        signal.removeEventListener('abort', abort);
        return installed.close();
      };
      const retire = () => { installedCarrier.close(); return releaseGatt(); };
      async function submitWifiHandoff(commitId: string, confirm: ConfirmCloudRegistration): Promise<void>;
      async function submitWifiHandoff<T>(commitId: string, confirm: ConfirmCloudRegistration,
        useCarrier: InitialCloudWifiCarrierConsumer<T>): Promise<T>;
      async function submitWifiHandoff<T>(commitId: string, confirm: ConfirmCloudRegistration,
        useCarrier?: InitialCloudWifiCarrierConsumer<T>): Promise<T | void> {
        if (handoffAttempted) throw Error('CLOUD_REGISTRATION_HANDOFF_CONSUMED');
        handoffAttempted = true;
        try {
          assertHandoffLive(); checkDeadline();
          const request = cloudRegistrationCommitRequest(intent, commitId, confirmation);
          let timer: ReturnType<typeof setTimeout> | undefined;
          let onStop: (() => void) | undefined;
          let result: unknown;
          try {
            result = await new Promise((resolve, reject) => {
              onStop = () => reject(Error('CLOUD_REGISTRATION_HANDOFF_RETIRED'));
              handoffStop.signal.addEventListener('abort', onStop, { once: true });
              timer = setTimeout(() => reject(Error('CLOUD_REGISTRATION_CLOSED')),
                Math.max(0, Math.min(120_000, deadline - Date.now())));
              const unconfirmed = () => reject(Error('CLOUD_REGISTRATION_CONFIRMATION_UNCONFIRMED'));
              try { void confirm(request, handoffStop.signal).then(resolve, unconfirmed); }
              catch { unconfirmed(); }
            });
          } finally {
            if (timer !== undefined) clearTimeout(timer);
            if (onStop) handoffStop.signal.removeEventListener('abort', onStop);
          }
          assertHandoffLive(); checkDeadline();
          assertCloudRegistrationCommitted(intent, result);
          handoffAuthorized = true;
          await installed.submitWifiHandoff(encodeInitialCloudWifiHandoff(intent));
          assertHandoffLive();
          await releaseGatt();
          assertOwner();
        } catch (error) {
          await retire().catch(() => undefined);
          if (handoffDispatched) throw Error('CLOUD_REGISTRATION_HANDOFF_UNKNOWN');
          throw error;
        }
        // App GATT release is not proof that the device's Host stopped. The
        // consumer must acquire the separately authenticated candidate AP.
        if (useCarrier) return installedCarrier.use(useCarrier);
        installedCarrier.close();
      }
      // The caller cannot change the receipt later submitted by this owner.
      return { confirmation: { ...confirmation, receipt: { ...confirmation.receipt } }, close: retire, submitWifiHandoff };
    } catch (error) {
      clear(); // Do not keep plaintext around while the native release settles.
      if (acquiring) await close().catch(() => undefined);
      // No cause or payload: carrier failures may include diagnostic data.
      if (dispatched) throw Error('CLOUD_REGISTRATION_INSTALL_UNKNOWN');
      throw error;
    } finally {
      if (!retained) { carrier?.close(); signal.removeEventListener('abort', abort); }
      if (acquiring) try { this.link.finishBootstrap?.(); } catch { /* Optional carrier hint. */ }
      clear();
    }
  }

  // Only this purpose-specific port may supply a service nonce. It always
  // performs a new Method 2; an already-ready session is not a confirmation.
  async authenticateAccessRegistration(
    value: AccessRegistrationIntent, target: BleDirectTarget, assertCurrent: () => void, signal: AbortSignal,
  ): Promise<{ session: BleDirectSession; confirmationDigest: string }> {
    validateAccessRegistrationIntent(value);
    const intent = { ...value, expectedRoot: { ...value.expectedRoot } };
    const check = () => {
      if (signal.aborted) throw signal.reason ?? Error('ACCESS_REGISTRATION_CANCELLED');
      assertCurrent();
      if (intent.state !== 'prepared' || Date.now() >= intent.expiresAt) throw Error('ACCESS_REGISTRATION_CLOSED');
    };
    check();
    if (target.profile.mode !== BleApplicationMode.Direct) throw Error('ACCESS_REGISTRATION_DIRECT_REQUIRED');
    const credential = await this.requireCredential(intent.sourceLogicalDeviceId);
    let session: BleDirectSession | undefined;
    const abort = () => { void this.link.disconnect().catch(() => undefined); };
    try {
      check();
      if (credential.state !== 'active' || credential.keyRotation
        || credential.accessEpoch !== intent.expectedRoot.accessEpoch
        || base64UrlEncode(credential.deviceInstanceId) !== intent.expectedRoot.deviceInstanceId
        || base64UrlEncode(credential.controllerId) !== intent.expectedRoot.controllerId
        || credential.credentialVersion !== intent.expectedRoot.credentialVersion
        || credential.cloudContext?.credentialVersion !== intent.expectedRoot.cloudCredentialVersion)
        throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED');
      const fingerprint = await this.crypto.adminFingerprint(credential.controllerId, credential.controllerSecret);
      try { if (base64UrlEncode(fingerprint) !== intent.expectedRoot.adminFingerprint) throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED'); }
      finally { fingerprint.fill(0); }
      check(); signal.addEventListener('abort', abort, { once: true });
      await this.link.connect(target); check();
      let confirmationDigest: string | undefined;
      session = await this.authenticate(intent.targetLogicalDeviceId, credential, {
        clientNonce: base64UrlDecode(intent.clientNonce, 16), check,
        confirmed: async context => { confirmationDigest = await accessRegistrationConfirmationDigest(this.crypto, intent, context); },
      });
      check();
      if (!confirmationDigest) throw Error('ACCESS_REGISTRATION_CONFIRMATION_MISSING');
      return { session, confirmationDigest };
    } catch (error) {
      if (session) await session.close().catch(() => undefined);
      else await this.link.disconnect().catch(() => undefined);
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      clearBleControllerCredentialSecrets(credential);
      try { this.link.finishBootstrap?.(); } catch { /* Original optional carrier hint. */ }
    }
  }

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
      await this.cancelPending(hello.deviceInstanceId, hello.accessEpoch);

      const controllerId = this.crypto.random(16);
      controllerSecret = this.crypto.random(32);
      const intentId = this.crypto.random(16);
      const commitId = this.crypto.random(16);
      const secretDigest = await this.crypto.sha256(controllerSecret);
      const adminFingerprint = await this.crypto.adminFingerprint(controllerId, controllerSecret);
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
    } finally {
      try { this.link.finishBootstrap?.(); } catch { /* Optional carrier hint. */ }
    }
  }

  async connect(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectSession> {
    const credential = await this.requireCredential(logicalDeviceId);
    let session: BleDirectSession | undefined;
    try {
      if (credential.state !== 'active') throw new Error('BLE_DIRECT_ENROLLMENT_PENDING');
      session = await this.connectWithCredential(credential, target);
      await session.synchronize();
      return session;
    } catch (error) {
      if (session) await session.close().catch(() => undefined);
      throw error;
    } finally {
      // synchronize() includes Manifest acceptance and fresh State. The native
      // link owns the optional hint, its deadline and generation/close fences.
      try { this.link.finishBootstrap?.(); } catch { /* Optional carrier hint. */ }
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
    } finally {
      try { this.link.finishBootstrap?.(); } catch { /* Optional carrier hint. */ }
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
      try { this.link.finishBootstrap?.(); } catch { /* Optional carrier hint. */ }
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
    registration?: RegistrationAuthentication,
  ): Promise<BleDirectSession> {
    const check = () => registration?.check();
    const helloProfile = registration?.checkInitialCloudWrite ? 'precloud-controller' : 'controller';
    check();
    // Read the physical MTU without activating it. ATT20 remains the carrier
    // throughout Method 2; only the subsequent authenticated Hello can change
    // packet size. Suppress unsolicited time requests until that exchange ends.
    const capacity = this.link.maxPacketSize && this.link.preparePacketNegotiation && this.link.applyPacketSize
      ? await this.link.maxPacketSize() : 20;
    check();
    const packetCapacity = Number.isInteger(capacity) && capacity >= 20 && capacity <= 244 ? capacity : 20;
    let sequence = 1;
    await this.link.sendRecord(makeBbp2Frame(
      Bbp2MessageKind.Hello, sequence, encodeDirectAppHelloBody(helloProfile, 512, packetCapacity === 20),
    ));
    const helloFrame = parseBbp2Response(
      await this.link.receiveRecord(), Bbp2MessageKind.Hello, sequence,
    );
    check();
    let hello = decodeDirectDeviceHelloBody(helloFrame.body, helloProfile);
    let maxFrameSize = Math.min(512, hello.maxFrameSize, hello.maxReassemblySize);

    const clientNonce = registration ? registration.clientNonce.slice() : this.crypto.random(16);
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
    check();
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
    check();
    if (!constantTimeEqual(expectedDeviceProof, challenge.deviceProof)) {
      throw new Error('BLE_DIRECT_DEVICE_PROOF_INVALID');
    }
    const appProof = await controllerAuthProof(
      this.crypto, credential.controllerSecret, context, 'app',
    );
    check();
    sequence += 1;
    await this.link.sendRecord(makeBbp2Frame(
      Bbp2MessageKind.Authenticate,
      sequence,
      encodeControllerAuthProof(appProof),
    ));
    const authorizedFrame = parseBbp2Response(
      await this.link.receiveRecord(), Bbp2MessageKind.AuthResult, sequence,
    );
    check();
    decodeControllerAuthAuthorized(authorizedFrame.body);
    const secure = await DirectSecureInitiator.create(
      this.crypto, credential.controllerSecret, context,
    );
    try { check(); } catch (error) { secure.clear(); throw error; }
    if (packetCapacity > 20) {
      try {
        this.link.preparePacketNegotiation!(packetCapacity);
        sequence += 1;
        const encryptedHello = await secure.encrypt(makeBbp2Frame(
          Bbp2MessageKind.Hello, sequence,
          encodeDirectAppHelloBody(helloProfile, maxFrameSize, true, packetCapacity),
        ));
        check(); await this.link.sendRecord(encryptedHello);
        const response = parseBbp2Response(await secure.decrypt(
          await this.link.receiveRecord(2000),
        ), Bbp2MessageKind.Hello, sequence);
        check();
        hello = decodeDirectDeviceHelloBody(response.body, helloProfile);
        const accepted = hello.blePacketSize ?? 20;
        if (accepted > packetCapacity) throw Error('BLE_DIRECT_PACKET_NEGOTIATION_INVALID');
        this.link.applyPacketSize!(accepted);
        maxFrameSize = Math.min(maxFrameSize, hello.maxFrameSize, hello.maxReassemblySize);
      } catch (error) {
        secure.clear();
        this.link.rememberPacketFallback?.();
        // Missing/legacy capability is a successful ATT20 answer. A timeout,
        // invalid authenticated answer or send failure is not safe to ignore.
        throw error;
      }
    }
    if (registration) {
      try { await registration.confirmed(context, secure); check(); }
      catch (error) { secure.clear(); throw error; }
    }
    const channel = new BleDirectSecureChannel(
      logicalDeviceId,
      this.link,
      secure,
      maxFrameSize,
      sequence,
      registration?.checkInitialCloudWrite,
      registration?.initialCloudPurpose,
    );
    if (registration?.checkInitialCloudWrite) return registration.initialCloudPurpose === 'installed-key-network'
      ? new InitialCloudNetworkRecoverySession(channel) : new InitialCloudRegistrationSession(channel);
    return new BleDirectSession(channel, undefined, 6000, { permissions: challenge.permissions, features: hello.features, maxFrameSize },
    hello.manifest && this.loadManifest ? {
      hello: hello.manifest, load: () => this.loadManifest!(logicalDeviceId),
    } : undefined);
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

  private async cancelPending(deviceInstanceId: Uint8Array, setupEpoch: number): Promise<void> {
    const credential = await this.store.findPending(deviceInstanceId);
    if (!credential) return;
    try {
      let result;
      try {
        result = await this.api.cancel(credential.intentId);
      } catch (error) {
        // Only an explicit server retirement plus a new Provisioning epoch can
        // discard this old pending checkpoint. A commit/network failure cannot.
        if (!(error instanceof GatewayHttpError) || error.httpStatus !== 410
          || error.code !== 'DEVICE_V2_BLE_ENROLLMENT_DEVICE_RETIRED'
          || setupEpoch === credential.accessEpoch) throw error;
        await this.store.remove(credential.logicalDeviceId);
        return;
      }
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
