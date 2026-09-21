import { HttpClient } from '@angular/common/http';
import { isGatewayRoutedDevice } from '../device-v2/device-routing';
import { Injectable } from '@angular/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BehaviorSubject, Observable } from 'rxjs';

import { API } from '../../configs/api.config';
import {
  BleApplicationMode,
  BleControllerCredential,
  BleModeProfile,
  BleDirectClient,
  BleEnrollmentApi,
  BleEnrollmentCancellation,
  BleEnrollmentIntent,
  BleDirectEnrollmentOptions,
  BleDirectEnrollmentObserver,
  BleDirectEnrollmentResult,
  BleDirectRecordLink,
  BleDirectSession,
  BleDirectTarget,
  BleDirectTargetMatcher,
  CapacitorBleControllerCredentialStore,
  CapacitorBleDirectRecordLink,
  HttpBleEnrollmentApi,
  HttpBlePresenceKeyApi,
  clearBlePresenceKeyBundleSecrets,
  clearBleControllerCredentialSecrets,
  discoverBlinkerDevice,
  discoverBlinkerDevices,
  matchesBlePresenceLocator,
  sameBytes,
} from '../device-v2/ble-direct';
import {
  DeviceV2AccountContext,
  assertDeviceV2AccountContext,
  captureDeviceV2AccountContext,
} from '../device-v2/account-scope';
import {
  EdgeGatewayAdminControlSession,
  EdgeGatewayChildControl,
} from '../device-v2/edge-gateway';
import { DeviceV2AccountState } from '../device-v2/account-client';
import { GatewayHttpError } from '../model/response.model';
import {
  DeviceV2Event,
  DeviceV2TargetSnapshot,
} from '../protocol/device-v2';
import { DeviceV2ManifestCache } from './device-v2-manifest-cache.service';
import { DataService } from './data.service';
import { BleDirectConnectionAdmission } from '../device-v2/ble-direct/transport';

function emptySnapshot(): DeviceV2TargetSnapshot {
  return {
    manifest: null,
    manifestAccepted: false,
    stateRevision: null,
    stateFresh: false,
    values: Object.create(null),
    eventInterrupted: true,
    cloudReachable: null,
    cloudLastSeenAt: null,
  };
}

interface ActiveBleSession {
  context: DeviceV2AccountContext;
  logicalDeviceId: string;
  session: BleDirectSession;
  detachState: () => void;
  detachEvents: () => void;
  detachErrors: () => void;
  admission?: BleDirectConnectionAdmission;
}

export type DeviceV2BleConnectionState = DeviceV2AccountState | 'nearby' | 'scanning';

export function unambiguousBlePresenceCandidate(
  logicalDeviceIds: readonly string[],
): string | undefined {
  const candidates = [...new Set(logicalDeviceIds)];
  return candidates.length === 1 ? candidates[0] : undefined;
}

export interface AuthorizedBlePresenceCandidate {
  logicalDeviceId: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  version: number;
  key: Uint8Array;
}

export async function matchAuthorizedBlePresence(
  profile: BleModeProfile,
  candidates: readonly AuthorizedBlePresenceCandidate[],
): Promise<string | undefined> {
  if (profile.wireVersion !== 3) return undefined;
  const matches: string[] = [];
  for (const candidate of candidates) {
    if (await matchesBlePresenceLocator(
      candidate.key,
      {
        deviceInstanceId: candidate.deviceInstanceId,
        accessEpoch: candidate.accessEpoch,
        presenceKeyVersion: candidate.version,
      },
      profile.modeLocator,
    )) matches.push(candidate.logicalDeviceId);
  }
  return unambiguousBlePresenceCandidate(matches);
}

function authorizedPresenceCandidates(
  logicalDeviceId: string,
  credential: BleControllerCredential,
): AuthorizedBlePresenceCandidate[] {
  return (credential.presenceKeys ?? []).map(presence => ({
    logicalDeviceId,
    deviceInstanceId: credential.deviceInstanceId,
    accessEpoch: presence.accessEpoch,
    version: presence.version,
    key: presence.key,
  }));
}

export async function syncOrAllocateBlePresenceKey(
  api: Pick<HttpBlePresenceKeyApi, 'sync' | 'allocate'>,
  logicalDeviceId: string,
  idempotencyKey: string,
) {
  try {
    return await api.sync(logicalDeviceId);
  } catch (error) {
    if (!(error instanceof GatewayHttpError)
      || error.httpStatus !== 404
      || error.code !== 'DEVICE_V2_PRESENCE_NOT_FOUND') {
      throw error;
    }
    return api.allocate(logicalDeviceId, idempotencyKey);
  }
}

let presenceOperationSequence = 0;

function newPresenceOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  presenceOperationSequence += 1;
  return `presence-${Date.now().toString(36)}-${presenceOperationSequence.toString(36)}`;
}

@Injectable({ providedIn: 'root' })
export class DeviceV2BleService implements EdgeGatewayChildControl {
  private readonly api: HttpBleEnrollmentApi;
  private readonly presenceApi: HttpBlePresenceKeyApi;
  private readonly snapshots = new Map<string, DeviceV2TargetSnapshot>();
  private readonly stateListeners = new Set<(
    logicalDeviceId: string,
    snapshot: DeviceV2TargetSnapshot,
  ) => void>();
  private readonly eventListeners = new Set<(event: DeviceV2Event) => void>();
  private readonly connectionStates = new Map<
    string,
    { subject: BehaviorSubject<DeviceV2BleConnectionState>; nearbyUntil: number }
  >();
  private nearbyTimer?: ReturnType<typeof setTimeout>;
  private readonly accountLinks = new Set<BleDirectRecordLink>();
  private readonly accountSessions = new Set<BleDirectSession>();
  private active?: ActiveBleSession;
  private closing?: Promise<void>;
  private opening?: {
    context: DeviceV2AccountContext;
    logicalDeviceId: string;
    promise: Promise<void>;
    abort: AbortController;
    admission?: BleDirectConnectionAdmission;
  };
  private generation = 0;
  private presence?: {
    scope: string;
    promise: Promise<void>;
    abort: AbortController;
  };
  private readonly presenceSyncs = new Map<string, Promise<void>>();
  private readonly adapterEnabled = new BehaviorSubject<boolean | null>(null);
  private adapterMonitoring?: Promise<void>;
  private accountSessionEpoch: number;

  constructor(
    http: HttpClient,
    private readonly manifestCache: DeviceV2ManifestCache,
    private readonly data: DataService,
  ) {
    this.api = new HttpBleEnrollmentApi(http);
    this.presenceApi = new HttpBlePresenceKeyApi(http);
    this.accountSessionEpoch = data.sessionEpoch;
    data.authDataChanged.subscribe(() => {
      if (this.accountSessionEpoch === data.sessionEpoch) return;
      this.accountSessionEpoch = data.sessionEpoch;
      this.resetAccountSession();
    });
  }

  discoverProvisioningDevices(timeoutMs?: number): Promise<BleDirectTarget[]> {
    return discoverBlinkerDevices(BleApplicationMode.Provisioning, timeoutMs);
  }

  discoverDirect(
    timeoutMs?: number,
    excludedDeviceIds?: ReadonlySet<string>,
    signal?: AbortSignal,
    matcher?: BleDirectTargetMatcher,
  ): Promise<BleDirectTarget> {
    return discoverBlinkerDevice(
      BleApplicationMode.Direct, timeoutMs, excludedDeviceIds, signal, matcher,
    );
  }

  async enroll(
    target: BleDirectTarget,
    options: BleDirectEnrollmentOptions,
  ): Promise<BleDirectEnrollmentResult> {
    return this.enrollUsing(new CapacitorBleDirectRecordLink(), target, options);
  }

  async enrollUsing(
    link: BleDirectRecordLink,
    target: BleDirectTarget,
    options: BleDirectEnrollmentOptions,
    observer?: BleDirectEnrollmentObserver,
  ): Promise<BleDirectEnrollmentResult> {
    const context = this.accountContext();
    const trackedLink = this.trackLink(link);
    try {
      const result = await this.client(trackedLink, context).enroll(
        target, options, observer,
      );
      this.trackSession(result.session, trackedLink);
      await this.assertAccountOrClose(context, result.session);
      const manifest = result.session.store.snapshot(result.logicalDeviceId).manifest;
      if (manifest) this.manifestCache.save(result.logicalDeviceId, manifest);
      return result;
    } catch (error) {
      this.accountLinks.delete(trackedLink);
      throw error;
    }
  }

  async credentialDeviceInstanceId(logicalDeviceId: string): Promise<Uint8Array> {
    const context = this.accountContext();
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential) throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    try {
      const result = credential.deviceInstanceId.slice();
      try {
        this.assertAccount(context);
        return result;
      } catch (error) {
        result.fill(0);
        throw error;
      }
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  pendingEnrollmentLogicalDeviceIds(): Promise<string[]> {
    const context = this.accountContext();
    return this.accountResult(
      context, this.credentialStore(context).listPending(),
    );
  }

  async enrollmentCredentialState(
    logicalDeviceId: string,
  ): Promise<'pending' | 'active' | undefined> {
    const context = this.accountContext();
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential) {
      this.assertAccount(context);
      return undefined;
    }
    try {
      const state = (credential.source ?? 'enrollment') === 'enrollment'
        ? credential.state
        : undefined;
      this.assertAccount(context);
      return state;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  // A fresh phone GATT link has no previous target for waitForMode(). Discover
  // only through this account's pending PresenceKey, then use the same resume.
  resume(logicalDeviceId: string, signal: AbortSignal): Promise<BleDirectEnrollmentResult> {
    const context = this.accountContext();
    const check = () => { signal.throwIfAborted(); this.assertAccount(context); };
    check();
    const link = new CapacitorBleDirectRecordLink({
      signal, assertAcquire: check, assertActive: check,
    });
    return this.resumeEnrollmentWithLink(link, logicalDeviceId, async matcher => {
      const target = await this.discoverDirect(15_000, undefined, signal, matcher);
      check();
      return target;
    });
  }

  resumeUsing(
    sourceLink: BleDirectRecordLink,
    logicalDeviceId: string,
  ): Promise<BleDirectEnrollmentResult> {
    return this.resumeEnrollmentWithLink(sourceLink, logicalDeviceId, matcher =>
      sourceLink.waitForMode(BleApplicationMode.Direct, 15_000, matcher));
  }

  private async resumeEnrollmentWithLink(
    sourceLink: BleDirectRecordLink,
    logicalDeviceId: string,
    findTarget: (matcher: BleDirectTargetMatcher) => Promise<BleDirectTarget>,
  ): Promise<BleDirectEnrollmentResult> {
    const context = this.accountContext();
    let session: BleDirectSession | undefined;
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential || credential.state !== 'pending'
      || (credential.source ?? 'enrollment') !== 'enrollment') {
      if (credential) clearBleControllerCredentialSecrets(credential);
      throw new Error('BLE_DIRECT_ENROLLMENT_PENDING_NOT_FOUND');
    }
    const link = this.trackLink(sourceLink);
    try {
      this.assertAccount(context);
      const authorized = authorizedPresenceCandidates(logicalDeviceId, credential);
      if (!authorized.length) {
        throw new Error('BLE_DIRECT_PRESENCE_CREDENTIAL_NOT_FOUND');
      }
      const target = await findTarget(
        candidate => matchAuthorizedBlePresence(
          candidate.profile, authorized,
        ).then(match => match === logicalDeviceId),
      );
      this.assertAccount(context);
      const result = await this.client(link, context).resume(logicalDeviceId, target);
      session = result.session;
      this.trackSession(session, link);
      await this.assertAccountOrClose(context, result.session);
      const manifest = result.session.store.snapshot(logicalDeviceId).manifest;
      if (manifest) this.manifestCache.save(logicalDeviceId, manifest);
      return result;
    } finally {
      if (!session) this.accountLinks.delete(link);
      clearBleControllerCredentialSecrets(credential);
    }
  }

  async connectUsing(
    sourceLink: BleDirectRecordLink,
    logicalDeviceId: string,
  ): Promise<BleDirectEnrollmentResult> {
    const context = this.accountContext();
    let session: BleDirectSession | undefined;
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential || credential.state !== 'active') {
      if (credential) clearBleControllerCredentialSecrets(credential);
      throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    }
    const link = this.trackLink(sourceLink);
    try {
      const authorized = authorizedPresenceCandidates(logicalDeviceId, credential);
      if (!authorized.length) {
        throw new Error('BLE_DIRECT_PRESENCE_CREDENTIAL_NOT_FOUND');
      }
      const target = await link.waitForMode(
        BleApplicationMode.Direct,
        15_000,
        candidate => matchAuthorizedBlePresence(
          candidate.profile, authorized,
        ).then(match => match === logicalDeviceId),
      );
      session = await this.client(link, context).connectEphemeral(
        logicalDeviceId, target, credential,
      );
      this.trackSession(session, link);
      await this.assertAccountOrClose(context, session);
      return {
        logicalDeviceId,
        session,
      };
    } finally {
      if (!session) this.accountLinks.delete(link);
      clearBleControllerCredentialSecrets(credential);
    }
  }

  createGatewayChildControl(
    enrollment: BleDirectEnrollmentResult,
    linkFactory: () => BleDirectRecordLink,
  ): EdgeGatewayChildControl {
    const context = this.accountContext();
    let initialSession: BleDirectSession | undefined = enrollment.session;
    const assertContext = async (): Promise<void> => {
      try {
        this.assertAccount(context);
      } catch (error) {
        const session = initialSession;
        initialSession = undefined;
        await session?.close().catch(() => undefined);
        throw error;
      }
    };
    return {
      withAdminControl: async <T>(
        childLogicalDeviceId: string,
        childDeviceInstanceId: Uint8Array,
        operation: (session: EdgeGatewayAdminControlSession) => Promise<T>,
      ): Promise<T> => {
        if (childLogicalDeviceId !== enrollment.logicalDeviceId || !initialSession) {
          throw new Error('EDGE_GATEWAY_ADMIN_SESSION_NOT_READY');
        }
        await assertContext();
        await this.requireDeviceInstance(
          childLogicalDeviceId, childDeviceInstanceId, context,
        );
        const session = initialSession;
        initialSession = undefined;
        let controlNonce: Uint8Array | undefined;
        try {
          await session.synchronize();
          this.assertAccount(context);
          controlNonce = await session.openControllerControl();
          const result = await operation({
            controlNonce,
            install: (grant, secret) => this.accountMutation(
              context, () => session.applyControllerMutation(grant, secret),
            ),
            revoke: grant => this.accountMutation(
              context, () => session.applyControllerMutation(grant, new Uint8Array()),
            ),
          });
          this.assertAccount(context);
          return result;
        } finally {
          controlNonce?.fill(0);
          await session.close().catch(() => undefined);
        }
      },
      confirmGatewayCredential: async input => {
        if (input.childLogicalDeviceId !== enrollment.logicalDeviceId) {
          throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
        }
        await assertContext();
        const admin = await this.credentialStore(context).load(input.childLogicalDeviceId);
        this.assertAccount(context);
        if (!admin || !sameBytes(admin.deviceInstanceId, input.childDeviceInstanceId)) {
          if (admin) clearBleControllerCredentialSecrets(admin);
          throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
        }
        let session: BleDirectSession | undefined;
        const link = this.trackLink(linkFactory());
        try {
          const authorized = authorizedPresenceCandidates(
            input.childLogicalDeviceId, admin,
          );
          const target = await link.waitForMode(
            BleApplicationMode.Direct,
            15_000,
            candidate => matchAuthorizedBlePresence(
              candidate.profile, authorized,
            ).then(match => match === input.childLogicalDeviceId),
          );
          session = await this.client(link, context).connectEphemeral(
            input.childLogicalDeviceId,
            target,
            {
              accessEpoch: input.accessEpoch,
              controllerId: input.controllerId,
              controllerSecret: input.gatewaySecret,
              credentialVersion: input.credentialVersion,
              permissions: input.permissions,
            },
          );
          this.trackSession(session, link);
          await this.assertAccountOrClose(context, session);
        } finally {
          await session?.close().catch(() => undefined);
          if (!session) this.accountLinks.delete(link);
          clearBleControllerCredentialSecrets(admin);
        }
      },
    };
  }

  async connect(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectSession> {
    const context = this.accountContext();
    const link = this.trackLink(new CapacitorBleDirectRecordLink());
    try {
      const session = await this.client(link, context).connect(logicalDeviceId, target);
      this.trackSession(session, link);
      await this.assertAccountOrClose(context, session);
      return session;
    } catch (error) {
      this.accountLinks.delete(link);
      throw error;
    }
  }

  async withAdminControl<T>(
    childLogicalDeviceId: string,
    childDeviceInstanceId: Uint8Array,
    operation: (session: EdgeGatewayAdminControlSession) => Promise<T>,
  ): Promise<T> {
    const context = this.accountContext();
    await this.requireDeviceInstance(childLogicalDeviceId, childDeviceInstanceId, context);
    await this.ensureReady(childLogicalDeviceId, 15_000, context);
    const active = this.active;
    if (!active || active.logicalDeviceId !== childLogicalDeviceId
      || !sameAccountContext(active.context, context)) {
      throw new Error('EDGE_GATEWAY_ADMIN_SESSION_NOT_READY');
    }
    let controlNonce: Uint8Array | undefined;
    try {
      this.assertAccount(context);
      controlNonce = await active.session.openControllerControl();
      const result = await operation({
        controlNonce,
        install: (grant, secret) => this.accountMutation(
          context, () => active.session.applyControllerMutation(grant, secret),
        ),
        revoke: grant => this.accountMutation(
          context, () => active.session.applyControllerMutation(grant, new Uint8Array()),
        ),
      });
      this.assertAccount(context);
      return result;
    } finally {
      controlNonce?.fill(0);
      await this.disconnect(childLogicalDeviceId);
    }
  }

  async confirmGatewayCredential(input: {
    childLogicalDeviceId: string;
    childDeviceInstanceId: Uint8Array;
    accessEpoch: number;
    controllerId: Uint8Array;
    credentialVersion: number;
    permissions: number;
    gatewaySecret: Uint8Array;
  }): Promise<void> {
    const context = this.accountContext();
    const admin = await this.credentialStore(context).load(input.childLogicalDeviceId);
    this.assertAccount(context);
    if (!admin || !sameBytes(admin.deviceInstanceId, input.childDeviceInstanceId)) {
      if (admin) clearBleControllerCredentialSecrets(admin);
      throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
    }
    let session: BleDirectSession | undefined;
    const link = this.trackLink(new CapacitorBleDirectRecordLink());
    try {
      const authorized = authorizedPresenceCandidates(
        input.childLogicalDeviceId, admin,
      );
      const matcher: BleDirectTargetMatcher = async target =>
        target.profile.wireVersion === 2
          || (await matchAuthorizedBlePresence(target.profile, authorized))
            === input.childLogicalDeviceId;
      const target = await this.discoverDirect(15_000, undefined, undefined, matcher);
      session = await this.client(link, context).connectEphemeral(
        input.childLogicalDeviceId,
        target,
        {
          accessEpoch: input.accessEpoch,
          controllerId: input.controllerId,
          controllerSecret: input.gatewaySecret,
          credentialVersion: input.credentialVersion,
          permissions: input.permissions,
        },
      );
      this.trackSession(session, link);
      await this.assertAccountOrClose(context, session);
    } finally {
      await session?.close().catch(() => undefined);
      if (!session) this.accountLinks.delete(link);
      clearBleControllerCredentialSecrets(admin);
    }
  }

  watchConnection(logicalDeviceId: string): Observable<DeviceV2BleConnectionState> {
    return this.connectionState(logicalDeviceId).asObservable();
  }

  watchAdapterEnabled(): Observable<boolean | null> {
    void this.ensureAdapterMonitoring();
    return this.adapterEnabled.asObservable();
  }

  connectionSnapshot(logicalDeviceId: string): DeviceV2BleConnectionState {
    return this.connectionState(logicalDeviceId).value;
  }

  async hasActiveCredential(logicalDeviceId: string): Promise<boolean> {
    const context = this.accountContext();
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential) {
      this.assertAccount(context);
      return false;
    }
    try {
      const active = credential.state === 'active';
      this.assertAccount(context);
      return active;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  async canManagePresenceCredential(logicalDeviceId: string): Promise<boolean> {
    const context = this.accountContext();
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential) {
      this.assertAccount(context);
      return false;
    }
    try {
      const allowed = credential.state === 'active' && (credential.permissions & 0x08) !== 0;
      this.assertAccount(context);
      return allowed;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  syncPresenceCredential(logicalDeviceId: string): Promise<void> {
    const context = this.accountContext();
    const key = accountOperationKey(context, logicalDeviceId);
    const existing = this.presenceSyncs.get(key);
    if (existing) return existing;
    const promise = this.performPresenceSync(logicalDeviceId, context).finally(() => {
      if (this.presenceSyncs.get(key) === promise) {
        this.presenceSyncs.delete(key);
      }
    });
    this.presenceSyncs.set(key, promise);
    return promise;
  }

  private async performPresenceSync(
    logicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    const api = this.accountPresenceApi(context);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const bundle = await syncOrAllocateBlePresenceKey(
        api,
        logicalDeviceId,
        newPresenceOperationId(),
      );
      try {
        await this.installPresenceBundle(bundle, context, api);
        if (bundle.current.deviceConfirmed) return;
      } finally {
        clearBlePresenceKeyBundleSecrets(bundle);
      }
    }
    throw new Error('BLE_PRESENCE_SYNC_BUSY');
  }

  async rotatePresenceCredential(
    logicalDeviceId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const context = this.accountContext();
    const api = this.accountPresenceApi(context);
    const existing = await api.sync(logicalDeviceId);
    try {
      if (!existing.current.deviceConfirmed) {
        await this.installPresenceBundle(existing, context, api);
        await this.performPresenceSync(logicalDeviceId, context);
        return;
      }
      const rotated = await api.rotate(
        logicalDeviceId, existing.current.version, idempotencyKey,
      );
      try {
        await this.installPresenceBundle(rotated, context, api);
      } finally {
        clearBlePresenceKeyBundleSecrets(rotated);
      }
      await this.performPresenceSync(logicalDeviceId, context);
    } finally {
      clearBlePresenceKeyBundleSecrets(existing);
    }
  }

  refreshPresence(logicalDeviceIds: readonly string[]): Promise<void> {
    const context = this.accountContext();
    if (this.active || this.opening) return Promise.resolve();
    const ids = [...new Set(logicalDeviceIds.filter(id => id.length > 0))];
    if (!ids.length) return Promise.resolve();
    const scope = accountOperationKey(context, [...ids].sort().join('\0'));
    if (this.presence) {
      if (this.presence.scope === scope) return this.presence.promise;
      const previous = this.presence;
      previous.abort.abort();
      return previous.promise.catch(() => undefined).then(
        () => this.refreshPresence(ids),
      );
    }
    const abort = new AbortController();
    const promise = this.scanPresence(ids, abort.signal, context)
      .catch(error => {
        if (!(error instanceof Error) || !['BLE_DIRECT_SCAN_CANCELLED', 'BLE_SCAN_CANCELLED'].includes(error.message)) {
          throw error;
        }
      })
      .finally(() => {
        if (this.presence?.promise === promise) this.presence = undefined;
      });
    this.presence = { scope, promise, abort };
    return promise;
  }

  ensureReady(
    logicalDeviceId: string,
    scanTimeoutMs = 15_000,
    context = this.accountContext(),
    admission?: BleDirectConnectionAdmission,
  ): Promise<void> {
    if (!Number.isInteger(scanTimeoutMs) || scanTimeoutMs < 1) {
      return Promise.reject(new Error('BLE_DIRECT_SCAN_TIMEOUT_INVALID'));
    }
    this.assertAccount(context);
    admission?.signal.throwIfAborted();
    admission?.assertActive();
    if (this.active?.logicalDeviceId === logicalDeviceId
      && sameAccountContext(this.active.context, context)
      && this.active.session.state === 'ready') {
      if (admission && this.active.admission !== admission) throw new Error('BLE_DIRECT_CONNECTION_OWNED');
      return this.accountMutation(context, () => this.active!.session.synchronize());
    }
    // Do not free a native acquisition slot merely because its caller stopped
    // waiting. Cancellation must finish before a successor can reuse the radio.
    if (this.opening?.abort.signal.aborted) {
      return this.opening.promise.catch(() => undefined).then(
        () => this.ensureReady(logicalDeviceId, scanTimeoutMs, context, admission));
    }
    if (this.opening?.logicalDeviceId === logicalDeviceId
      && sameAccountContext(this.opening.context, context)) {
      if (admission && this.opening.admission !== admission) throw new Error('BLE_DIRECT_CONNECTION_OWNED');
      return this.opening.promise;
    }
    if (this.opening) throw new Error('BLE_DIRECT_CONNECTION_OWNED');

    const generation = ++this.generation;
    const abort = new AbortController();
    const cancel = () => abort.abort();
    admission?.signal.addEventListener('abort', cancel, { once: true });
    const promise = this.open(
      logicalDeviceId, generation, abort.signal, scanTimeoutMs, context, admission,
    ).finally(() => {
      admission?.signal.removeEventListener('abort', cancel);
      if (this.opening?.promise === promise) this.opening = undefined;
    });
    this.opening = { context, logicalDeviceId, promise, abort, admission };
    return promise;
  }

  async disconnect(logicalDeviceId: string, admission?: BleDirectConnectionAdmission): Promise<void> {
    if (this.closing) await this.closing;
    const opening = this.opening?.logicalDeviceId === logicalDeviceId
      && (!admission || this.opening.admission === admission) ? this.opening : undefined;
    const active = this.active?.logicalDeviceId === logicalDeviceId
      && (!admission || this.active.admission === admission);
    if (!active && !opening) return;
    this.generation += 1;
    opening?.abort.abort();
    if (active) await this.closeActive();
    // Cancellation settles logical work first. Do not report physical release
    // while the original opening can still deliver a late native connection.
    await opening?.promise.catch(error => {
      if (error instanceof Error && error.message === 'BLE_DIRECT_NATIVE_RELEASE_FAILED') throw error;
    });
    this.setConnection(logicalDeviceId, 'nearby');
  }

  snapshot(logicalDeviceId: string): DeviceV2TargetSnapshot {
    return this.snapshots.get(logicalDeviceId) ?? emptySnapshot();
  }

  subscribe(
    listener: (logicalDeviceId: string, snapshot: DeviceV2TargetSnapshot) => void,
  ): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeEvents(listener: (event: DeviceV2Event) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async command(
    logicalDeviceId: string,
    endpointKey: string,
    value: unknown,
  ): Promise<void> {
    const context = this.accountContext();
    if (!this.isGatewayChild(logicalDeviceId)) await this.ensureReady(logicalDeviceId, 15_000, context);
    await this.commandConnected(logicalDeviceId, endpointKey, value, context);
  }

  // A routed child command must never implicitly reconnect after its physical
  // permit has retired. The selector owns acquisition and any read-only fallback.
  async commandConnected(logicalDeviceId: string, endpointKey: string, value: unknown,
    context = this.accountContext()): Promise<void> {
    this.assertAccount(context);
    const active = this.active;
    if (!active || active.logicalDeviceId !== logicalDeviceId
      || !sameAccountContext(active.context, context)) {
      throw new Error('BLE_DIRECT_SESSION_NOT_READY');
    }
    active.admission?.signal.throwIfAborted();
    active.admission?.assertActive();
    await this.accountMutation(
      context, () => active.session.command(endpointKey, value),
    );
  }

  private client(
    link: BleDirectRecordLink = new CapacitorBleDirectRecordLink(),
    context: DeviceV2AccountContext = this.accountContext(),
  ): BleDirectClient {
    return new BleDirectClient(
      link, this.accountBoundApi(context), this.credentialStore(context),
      undefined, logicalDeviceId => {
        this.assertAccount(context);
        return this.manifestCache.load(logicalDeviceId);
      },
    );
  }

  private accountContext(): DeviceV2AccountContext {
    return captureDeviceV2AccountContext(this.data, API.BASE_URL);
  }

  private assertAccount(context: DeviceV2AccountContext): void {
    assertDeviceV2AccountContext(this.data, context);
  }

  private isCurrentAccount(context: DeviceV2AccountContext): boolean {
    try {
      this.assertAccount(context);
      return true;
    } catch {
      return false;
    }
  }

  private async assertAccountOrClose(
    context: DeviceV2AccountContext,
    session: BleDirectSession,
  ): Promise<void> {
    try {
      this.assertAccount(context);
    } catch (error) {
      await session.close().catch(() => undefined);
      throw error;
    }
  }

  private credentialStore(
    context?: DeviceV2AccountContext,
  ): CapacitorBleControllerCredentialStore {
    return new CapacitorBleControllerCredentialStore(
      context ? () => context : () => this.accountContext(),
    );
  }

  private accountBoundApi(context: DeviceV2AccountContext): BleEnrollmentApi {
    const call = async <T>(
      operation: () => Promise<T>,
      clear: (result: T) => void,
    ): Promise<T> => {
      this.assertAccount(context);
      const result = await operation();
      try {
        this.assertAccount(context);
        return result;
      } catch (error) {
        clear(result);
        throw error;
      }
    };
    return {
      issue: request => call(
        () => this.api.issue(request), clearEnrollmentIntent,
      ),
      commit: (intentId, commitId, receipt) => call(
        () => this.api.commit(intentId, commitId, receipt),
        result => result.controllerId.fill(0),
      ),
      cancel: intentId => call(
        () => this.api.cancel(intentId), clearEnrollmentCancellation,
      ),
    };
  }

  private accountPresenceApi(
    context: DeviceV2AccountContext,
  ): Pick<HttpBlePresenceKeyApi, 'sync' | 'allocate' | 'rotate' | 'confirm'> {
    const call = async <T extends Awaited<ReturnType<HttpBlePresenceKeyApi['sync']>>>(
      operation: () => Promise<T>,
    ): Promise<T> => {
      this.assertAccount(context);
      const result = await operation();
      try {
        this.assertAccount(context);
        return result;
      } catch (error) {
        clearBlePresenceKeyBundleSecrets(result);
        throw error;
      }
    };
    return {
      sync: logicalDeviceId => call(() => this.presenceApi.sync(logicalDeviceId)),
      allocate: (logicalDeviceId, idempotencyKey) => call(
        () => this.presenceApi.allocate(logicalDeviceId, idempotencyKey),
      ),
      rotate: (logicalDeviceId, expectedVersion, idempotencyKey) => call(
        () => this.presenceApi.rotate(logicalDeviceId, expectedVersion, idempotencyKey),
      ),
      confirm: (logicalDeviceId, receipt) => call(
        () => this.presenceApi.confirm(logicalDeviceId, receipt),
      ),
    };
  }

  private async accountResult<T>(
    context: DeviceV2AccountContext,
    operation: Promise<T>,
  ): Promise<T> {
    const result = await operation;
    this.assertAccount(context);
    return result;
  }

  private async accountMutation<T>(
    context: DeviceV2AccountContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.assertAccount(context);
    const result = await operation();
    this.assertAccount(context);
    return result;
  }

  private resetAccountSession(): void {
    this.generation += 1;
    this.opening?.abort.abort();
    this.presence?.abort.abort();
    this.presence = undefined;
    this.presenceSyncs.clear();
    const active = this.active;
    void this.closeActive();
    const sessions = [...this.accountSessions];
    const links = [...this.accountLinks];
    this.accountSessions.clear();
    this.accountLinks.clear();
    if (active && !sessions.includes(active.session)) sessions.push(active.session);
    for (const session of sessions) if (session !== active?.session) void session.close().catch(() => undefined);
    for (const link of links) void link.disconnect().catch(() => undefined);
    this.snapshots.clear();
    clearTimeout(this.nearbyTimer); this.nearbyTimer = undefined;
    for (const state of this.connectionStates.values()) { state.nearbyUntil = 0; state.subject.next('idle'); }
  }

  private ensureAdapterMonitoring(): Promise<void> {
    if (this.adapterMonitoring) return this.adapterMonitoring;
    const monitoring = BleClient.initialize({ androidNeverForLocation: true })
      .then(async () => {
        await BleClient.startEnabledNotifications(enabled => {
          this.adapterEnabled.next(enabled);
        });
        this.adapterEnabled.next(await BleClient.isEnabled());
      })
      .catch(() => this.adapterEnabled.next(false));
    this.adapterMonitoring = monitoring;
    return monitoring;
  }

  private async requireDeviceInstance(
    logicalDeviceId: string,
    expected: Uint8Array,
    context = this.accountContext(),
  ): Promise<void> {
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential) throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    try {
      if (!sameBytes(credential.deviceInstanceId, expected)) {
        throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
      }
      this.assertAccount(context);
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  private async installPresenceBundle(
    bundle: Awaited<ReturnType<HttpBlePresenceKeyApi['reveal']>>,
    context: DeviceV2AccountContext,
    api: Pick<HttpBlePresenceKeyApi, 'confirm'>,
  ): Promise<void> {
    this.assertAccount(context);
    await this.savePresenceBundle(bundle, context);
    if (bundle.current.deviceConfirmed) return;
    const expectedVersion = bundle.previous?.version ?? 0;
    if (bundle.current.version !== expectedVersion + 1
      || (expectedVersion !== 0 && !bundle.previous)) {
      throw new Error('BLE_PRESENCE_PENDING_STATE_INVALID');
    }
    // Automatic key maintenance is not another physical acquisition owner.
    // A managed child must already have an authorized connection; retain the
    // pending bundle for a later explicit connection instead of racing the Hub.
    if (!this.isGatewayChild(bundle.logicalDeviceId)) await this.ensureReady(bundle.logicalDeviceId, 15_000, context);
    const active = this.active;
    if (!active || active.logicalDeviceId !== bundle.logicalDeviceId
      || !sameAccountContext(active.context, context)) {
      throw new Error('BLE_DIRECT_SESSION_NOT_READY');
    }
    active.admission?.signal.throwIfAborted();
    active.admission?.assertActive();
    const receipt = await active.session.replacePresenceKey(
      bundle.current.accessEpoch,
      expectedVersion,
      bundle.current.version,
      bundle.current.key,
    );
    try {
      const confirmed = await api.confirm(
        bundle.logicalDeviceId, receipt.encoded,
      );
      try {
        await this.savePresenceBundle(confirmed, context);
      } finally {
        clearBlePresenceKeyBundleSecrets(confirmed);
      }
    } finally {
      receipt.keyDigest.fill(0);
      receipt.proof.fill(0);
    }
  }

  private isGatewayChild(logicalDeviceId: string): boolean {
    return isGatewayRoutedDevice(this.data.getDevice(logicalDeviceId));
  }

  private savePresenceBundle(
    bundle: Awaited<ReturnType<HttpBlePresenceKeyApi['reveal']>>,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    return this.credentialStore(context).replacePresenceKeys(bundle.logicalDeviceId, [
      {
        state: 'current',
        accessEpoch: bundle.current.accessEpoch,
        version: bundle.current.version,
        key: bundle.current.key,
      },
      ...(bundle.previous ? [{
        state: 'previous' as const,
        accessEpoch: bundle.previous.accessEpoch,
        version: bundle.previous.version,
        key: bundle.previous.key,
      }] : []),
    ]);
  }

  private async open(
    logicalDeviceId: string,
    generation: number,
    signal: AbortSignal,
    scanTimeoutMs: number,
    context: DeviceV2AccountContext,
    admission?: BleDirectConnectionAdmission,
  ): Promise<void> {
    this.assertAccount(context);
    // Draining background discovery belongs to this opening too. Otherwise
    // page exit can miss the not-yet-registered attempt and start a late scan.
    const presence = this.presence;
    if (presence) {
      presence.abort.abort();
      await presence.promise.catch(() => undefined);
      this.assertAccount(context);
      signal.throwIfAborted();
    }
    await this.closeActive();
    this.assertAccount(context);
    signal.throwIfAborted();
    if (generation !== this.generation) throw new Error('BLE_DIRECT_CONNECT_CANCELLED');
    this.setConnection(logicalDeviceId, 'connecting');
    let session: BleDirectSession | undefined;
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    if (!credential || credential.state !== 'active') {
      if (credential) clearBleControllerCredentialSecrets(credential);
      this.setConnection(logicalDeviceId, 'stopped');
      throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    }
    const authorized = authorizedPresenceCandidates(logicalDeviceId, credential);
    const matchesTarget: BleDirectTargetMatcher = async target => {
      // Direct v2 has no privacy-preserving locator and is retained only long
      // enough to install the first PresenceKey. Current v3 devices must be
      // selected before GATT connection, never by trying arbitrary MACs.
      if (target.profile.wireVersion === 2) return !admission;
      return (await matchAuthorizedBlePresence(target.profile, authorized))
        === logicalDeviceId;
    };
    try {
      const deadline = performance.now() + scanTimeoutMs;
      const rejected = new Set<string>();
      while (!session) {
        signal.throwIfAborted();
        admission?.assertAcquire();
        const remaining = Math.ceil(deadline - performance.now());
        if (remaining < 1) throw new Error('BLE_DIRECT_SCAN_TIMEOUT');
        const target = await this.discoverDirect(
          remaining, rejected, signal, matchesTarget,
        );
        this.assertAccount(context);
        signal.throwIfAborted();
        if (generation !== this.generation) throw new Error('BLE_DIRECT_CONNECT_CANCELLED');
        const link = this.trackLink(new CapacitorBleDirectRecordLink({
          signal: admission?.signal ?? signal,
          assertAcquire: () => admission?.assertAcquire(), assertActive: () => admission?.assertActive(),
          onAcquire: () => admission?.onAcquire?.(),
        }));
        const cancelLink = () => { void link.disconnect().catch(() => undefined); };
        signal.addEventListener('abort', cancelLink, { once: true });
        try {
          session = await this.client(link, context).connect(logicalDeviceId, target);
          this.trackSession(session, link);
          await this.assertAccountOrClose(context, session);
        } catch (error) {
          await link.disconnect();
          this.accountLinks.delete(link);
          if (!this.isCandidateMismatch(error)) throw error;
          rejected.add(target.device.deviceId);
        } finally { signal.removeEventListener('abort', cancelLink); }
      }
      if (generation !== this.generation) {
        await session.close();
        throw new Error('BLE_DIRECT_CONNECT_CANCELLED');
      }
      this.assertAccount(context);
      signal.throwIfAborted();
      admission?.assertActive();
      this.attach(logicalDeviceId, session, context, admission);
      this.setConnection(logicalDeviceId, 'ready');
    } catch (error) {
      if (session) await session.close();
      if (error instanceof Error && error.message === 'BLE_DIRECT_NATIVE_RELEASE_FAILED') throw error;
      if (generation !== this.generation) throw new Error('BLE_DIRECT_CONNECT_CANCELLED');
      this.setConnection(logicalDeviceId, 'stopped');
      throw error;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  private attach(
    logicalDeviceId: string,
    session: BleDirectSession,
    context: DeviceV2AccountContext,
    admission?: BleDirectConnectionAdmission,
  ): void {
    const publish = (snapshot: DeviceV2TargetSnapshot) => {
      if (!this.isCurrentAccount(context)) return;
      this.snapshots.set(logicalDeviceId, snapshot);
      if (snapshot.manifestAccepted && snapshot.manifest) {
        this.manifestCache.save(logicalDeviceId, snapshot.manifest);
      }
      for (const listener of this.stateListeners) listener(logicalDeviceId, snapshot);
    };
    const active: ActiveBleSession = {
      context,
      logicalDeviceId,
      session,
      admission,
      detachState: session.store.subscribe((changedId, snapshot) => {
        if (changedId === logicalDeviceId) publish(snapshot);
      }),
      detachEvents: session.store.subscribeEvents(event => {
        if (event.logicalDeviceId === logicalDeviceId && this.isCurrentAccount(context)) {
          for (const listener of this.eventListeners) listener(event);
        }
      }),
      detachErrors: () => undefined,
    };
    active.detachErrors = session.subscribeErrors(() => {
      if (this.active !== active) return;
      void this.closeActive();
      this.setConnection(logicalDeviceId, 'stopped');
    });
    this.active = active;
    publish(session.store.snapshot(logicalDeviceId));
  }

  private closeActive(): Promise<void> {
    if (this.closing) return this.closing;
    const active = this.active;
    if (!active) return Promise.resolve();
    const generation = this.generation;
    this.active = undefined;
    this.detach(active);
    const task = Promise.resolve().then(() => active.session.close()).then(() => {
      if (generation !== this.generation || !this.isCurrentAccount(active.context)) return;
      this.setConnection(active.logicalDeviceId, 'nearby');
      const snapshot = active.session.store.snapshot(active.logicalDeviceId);
      this.snapshots.set(active.logicalDeviceId, snapshot);
      for (const listener of this.stateListeners) listener(active.logicalDeviceId, snapshot);
    }).then(() => { if (this.closing === task) this.closing = undefined; });
    this.closing = task;
    // Keep a rejected closing barrier: a new account/scope cannot turn unknown
    // physical capacity into a fresh scan. onClosed retires the caller early;
    // it is deliberately NOT an SDK-release notification.
    void task.catch(() => undefined);
    active.admission?.onClosed?.();
    return task;
  }

  private trackLink<T extends BleDirectRecordLink>(link: T): T {
    this.accountLinks.add(link);
    return link;
  }

  private trackSession(session: BleDirectSession, link: BleDirectRecordLink): void {
    this.accountSessions.add(session);
    let unsubscribe = () => undefined;
    unsubscribe = session.subscribeClosed(() => {
      unsubscribe();
      this.accountSessions.delete(session);
      this.accountLinks.delete(link);
    });
  }

  private detach(active: ActiveBleSession): void {
    active.detachState();
    active.detachEvents();
    active.detachErrors();
  }

  private isCandidateMismatch(error: unknown): boolean {
    const code = error instanceof Error ? error.message : '';
    return code === 'BLE_DIRECT_BBP2_RESPONSE_INVALID'
      || code === 'BLE_DIRECT_DEVICE_PROOF_INVALID'
      || code.startsWith('BLE_DIRECT_AUTH_');
  }

  private connectionState(
    logicalDeviceId: string,
  ): BehaviorSubject<DeviceV2BleConnectionState> {
    let state = this.connectionStates.get(logicalDeviceId);
    if (!state) {
      state = { subject: new BehaviorSubject<DeviceV2BleConnectionState>('idle'), nearbyUntil: 0 };
      this.connectionStates.set(logicalDeviceId, state);
    }
    return state.subject;
  }

  private setConnection(logicalDeviceId: string, state: DeviceV2BleConnectionState): void {
    const subject = this.connectionState(logicalDeviceId);
    const entry = this.connectionStates.get(logicalDeviceId)!;
    if (state === 'nearby') entry.nearbyUntil = performance.now() + 15_000;
    else if (state !== 'scanning') entry.nearbyUntil = 0;
    this.expireNearby();
    if (subject.value !== state) subject.next(state);
  }

  private expireNearby(): void {
    clearTimeout(this.nearbyTimer); this.nearbyTimer = undefined;
    const now = performance.now(); let next = Infinity;
    for (const entry of this.connectionStates.values()) {
      if (!entry.nearbyUntil) continue;
      if (entry.nearbyUntil <= now) {
        entry.nearbyUntil = 0;
        if (entry.subject.value === 'nearby') entry.subject.next('stopped');
      } else next = Math.min(next, entry.nearbyUntil);
    }
    if (next !== Infinity) this.nearbyTimer = setTimeout(() => this.expireNearby(), Math.ceil(next - now));
  }

  private async scanPresence(
    logicalDeviceIds: readonly string[],
    signal: AbortSignal,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    const authorized: AuthorizedBlePresenceCandidate[] = [];
    const scanning = new Set<string>();
    let observed = false;
    try {
      for (const logicalDeviceId of logicalDeviceIds) {
        if (this.connectionState(logicalDeviceId).value === 'ready') continue;
        if (this.connectionState(logicalDeviceId).value !== 'nearby') this.setConnection(logicalDeviceId, 'idle');
        const credential = await this.credentialStore(context).load(
          logicalDeviceId,
        ).catch(() => undefined);
        this.assertAccount(context);
        if (!credential) { this.setConnection(logicalDeviceId, 'idle'); continue; }
        try {
          if (credential.state !== 'active') continue;
          const presenceKeys = credential.presenceKeys ?? [];
          for (const presence of presenceKeys) {
            authorized.push({
              logicalDeviceId,
              deviceInstanceId: credential.deviceInstanceId.slice(),
              accessEpoch: presence.accessEpoch,
              version: presence.version,
              key: presence.key.slice(),
            });
          }
          if (!presenceKeys.length) continue;
          this.setConnection(logicalDeviceId, 'scanning');
          scanning.add(logicalDeviceId);
        } finally {
          clearBleControllerCredentialSecrets(credential);
        }
      }
      if (!authorized.length || signal.aborted) return;
      const targets = await discoverBlinkerDevices(BleApplicationMode.Direct, 2_500, signal);
      this.assertAccount(context);
      if (signal.aborted) return;
      observed = true;
      for (const target of targets) {
        const logicalDeviceId = await matchAuthorizedBlePresence(
          target.profile,
          authorized,
        );
        this.assertAccount(context);
        if (signal.aborted) return;
        if (logicalDeviceId) this.setConnection(logicalDeviceId, 'nearby');
      }
    } finally {
      for (const presence of authorized) {
        presence.deviceInstanceId.fill(0);
        presence.key.fill(0);
      }
      for (const logicalDeviceId of scanning) {
        if (this.isCurrentAccount(context)
          && this.connectionState(logicalDeviceId).value === 'scanning') {
          const entry = this.connectionStates.get(logicalDeviceId)!;
          if (!observed && entry.nearbyUntil > performance.now()) entry.subject.next('nearby');
          else this.setConnection(logicalDeviceId, 'stopped');
        }
      }
    }
  }
}

function sameAccountContext(
  left: DeviceV2AccountContext,
  right: DeviceV2AccountContext,
): boolean {
  return left.authority === right.authority
    && left.accountId === right.accountId
    && left.sessionEpoch === right.sessionEpoch;
}

function accountOperationKey(
  context: DeviceV2AccountContext,
  value: string,
): string {
  return `${context.authority}\0${context.accountId}\0${context.sessionEpoch}\0${value}`;
}

function clearEnrollmentIntent(result: BleEnrollmentIntent): void {
  result.intentId.fill(0);
  result.grant.fill(0);
  result.presenceKey.fill(0);
}

function clearEnrollmentCancellation(result: BleEnrollmentCancellation): void {
  result.intentId.fill(0);
  result.deviceInstanceId.fill(0);
  result.controllerId.fill(0);
}
