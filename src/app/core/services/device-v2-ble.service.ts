import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  BleApplicationMode,
  BleControllerCredential,
  BleModeProfile,
  BleDirectClient,
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
  logicalDeviceId: string;
  session: BleDirectSession;
  detachState: () => void;
  detachEvents: () => void;
  detachErrors: () => void;
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
  private readonly credentials = new CapacitorBleControllerCredentialStore();
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
    BehaviorSubject<DeviceV2BleConnectionState>
  >();
  private active?: ActiveBleSession;
  private opening?: {
    logicalDeviceId: string;
    promise: Promise<void>;
    abort: AbortController;
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

  constructor(
    http: HttpClient,
    private readonly manifestCache: DeviceV2ManifestCache,
  ) {
    this.api = new HttpBleEnrollmentApi(http);
    this.presenceApi = new HttpBlePresenceKeyApi(http);
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
    const result = await this.client(link).enroll(target, options, observer);
    const manifest = result.session.store.snapshot(result.logicalDeviceId).manifest;
    if (manifest) this.manifestCache.save(result.logicalDeviceId, manifest);
    return result;
  }

  async credentialDeviceInstanceId(logicalDeviceId: string): Promise<Uint8Array> {
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential) throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    try {
      return credential.deviceInstanceId.slice();
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  pendingEnrollmentLogicalDeviceIds(): Promise<string[]> {
    return this.credentials.listPending();
  }

  async enrollmentCredentialState(
    logicalDeviceId: string,
  ): Promise<'pending' | 'active' | undefined> {
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential) return undefined;
    try {
      return (credential.source ?? 'enrollment') === 'enrollment'
        ? credential.state
        : undefined;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  async resumeUsing(
    link: BleDirectRecordLink,
    logicalDeviceId: string,
  ): Promise<BleDirectEnrollmentResult> {
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential || credential.state !== 'pending'
      || (credential.source ?? 'enrollment') !== 'enrollment') {
      if (credential) clearBleControllerCredentialSecrets(credential);
      throw new Error('BLE_DIRECT_ENROLLMENT_PENDING_NOT_FOUND');
    }
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
      const result = await this.client(link).resume(logicalDeviceId, target);
      const manifest = result.session.store.snapshot(logicalDeviceId).manifest;
      if (manifest) this.manifestCache.save(logicalDeviceId, manifest);
      return result;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  async connectUsing(
    link: BleDirectRecordLink,
    logicalDeviceId: string,
  ): Promise<BleDirectEnrollmentResult> {
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential || credential.state !== 'active') {
      if (credential) clearBleControllerCredentialSecrets(credential);
      throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    }
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
      return {
        logicalDeviceId,
        session: await this.client(link).connectEphemeral(
          logicalDeviceId, target, credential,
        ),
      };
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  createGatewayChildControl(
    enrollment: BleDirectEnrollmentResult,
    linkFactory: () => BleDirectRecordLink,
  ): EdgeGatewayChildControl {
    let initialSession: BleDirectSession | undefined = enrollment.session;
    return {
      withAdminControl: async <T>(
        childLogicalDeviceId: string,
        childDeviceInstanceId: Uint8Array,
        operation: (session: EdgeGatewayAdminControlSession) => Promise<T>,
      ): Promise<T> => {
        if (childLogicalDeviceId !== enrollment.logicalDeviceId || !initialSession) {
          throw new Error('EDGE_GATEWAY_ADMIN_SESSION_NOT_READY');
        }
        await this.requireDeviceInstance(childLogicalDeviceId, childDeviceInstanceId);
        const session = initialSession;
        initialSession = undefined;
        let controlNonce: Uint8Array | undefined;
        try {
          await session.synchronize();
          controlNonce = await session.openControllerControl();
          return await operation({
            controlNonce,
            install: (grant, secret) => session.applyControllerMutation(grant, secret),
            revoke: grant => session.applyControllerMutation(grant, new Uint8Array()),
          });
        } finally {
          controlNonce?.fill(0);
          await session.close().catch(() => undefined);
        }
      },
      confirmGatewayCredential: async input => {
        if (input.childLogicalDeviceId !== enrollment.logicalDeviceId) {
          throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
        }
        const admin = await this.credentials.load(input.childLogicalDeviceId);
        if (!admin || !sameBytes(admin.deviceInstanceId, input.childDeviceInstanceId)) {
          if (admin) clearBleControllerCredentialSecrets(admin);
          throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
        }
        let session: BleDirectSession | undefined;
        try {
          const authorized = authorizedPresenceCandidates(
            input.childLogicalDeviceId, admin,
          );
          const link = linkFactory();
          const target = await link.waitForMode(
            BleApplicationMode.Direct,
            15_000,
            candidate => matchAuthorizedBlePresence(
              candidate.profile, authorized,
            ).then(match => match === input.childLogicalDeviceId),
          );
          session = await this.client(link).connectEphemeral(
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
        } finally {
          await session?.close().catch(() => undefined);
          clearBleControllerCredentialSecrets(admin);
        }
      },
    };
  }

  connect(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectSession> {
    return this.client().connect(logicalDeviceId, target);
  }

  async withAdminControl<T>(
    childLogicalDeviceId: string,
    childDeviceInstanceId: Uint8Array,
    operation: (session: EdgeGatewayAdminControlSession) => Promise<T>,
  ): Promise<T> {
    await this.requireDeviceInstance(childLogicalDeviceId, childDeviceInstanceId);
    await this.ensureReady(childLogicalDeviceId);
    const active = this.active;
    if (!active || active.logicalDeviceId !== childLogicalDeviceId) {
      throw new Error('EDGE_GATEWAY_ADMIN_SESSION_NOT_READY');
    }
    let controlNonce: Uint8Array | undefined;
    try {
      controlNonce = await active.session.openControllerControl();
      return await operation({
        controlNonce,
        install: (grant, secret) => active.session.applyControllerMutation(grant, secret),
        revoke: grant => active.session.applyControllerMutation(grant, new Uint8Array()),
      });
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
    const admin = await this.credentials.load(input.childLogicalDeviceId);
    if (!admin || !sameBytes(admin.deviceInstanceId, input.childDeviceInstanceId)) {
      if (admin) clearBleControllerCredentialSecrets(admin);
      throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
    }
    let session: BleDirectSession | undefined;
    try {
      const authorized = authorizedPresenceCandidates(
        input.childLogicalDeviceId, admin,
      );
      const matcher: BleDirectTargetMatcher = async target =>
        target.profile.wireVersion === 2
          || (await matchAuthorizedBlePresence(target.profile, authorized))
            === input.childLogicalDeviceId;
      const target = await this.discoverDirect(15_000, undefined, undefined, matcher);
      session = await this.client().connectEphemeral(
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
    } finally {
      await session?.close().catch(() => undefined);
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
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential) return false;
    try {
      return credential.state === 'active';
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  async canManagePresenceCredential(logicalDeviceId: string): Promise<boolean> {
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential) return false;
    try {
      return credential.state === 'active' && (credential.permissions & 0x08) !== 0;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  syncPresenceCredential(logicalDeviceId: string): Promise<void> {
    const existing = this.presenceSyncs.get(logicalDeviceId);
    if (existing) return existing;
    const promise = this.performPresenceSync(logicalDeviceId).finally(() => {
      if (this.presenceSyncs.get(logicalDeviceId) === promise) {
        this.presenceSyncs.delete(logicalDeviceId);
      }
    });
    this.presenceSyncs.set(logicalDeviceId, promise);
    return promise;
  }

  private async performPresenceSync(logicalDeviceId: string): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const bundle = await syncOrAllocateBlePresenceKey(
        this.presenceApi,
        logicalDeviceId,
        newPresenceOperationId(),
      );
      try {
        await this.installPresenceBundle(bundle);
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
    const existing = await this.presenceApi.sync(logicalDeviceId);
    try {
      if (!existing.current.deviceConfirmed) {
        await this.installPresenceBundle(existing);
        await this.syncPresenceCredential(logicalDeviceId);
        return;
      }
      const rotated = await this.presenceApi.rotate(
        logicalDeviceId, existing.current.version, idempotencyKey,
      );
      try {
        await this.installPresenceBundle(rotated);
      } finally {
        clearBlePresenceKeyBundleSecrets(rotated);
      }
      await this.syncPresenceCredential(logicalDeviceId);
    } finally {
      clearBlePresenceKeyBundleSecrets(existing);
    }
  }

  refreshPresence(logicalDeviceIds: readonly string[]): Promise<void> {
    if (this.active || this.opening) return Promise.resolve();
    const ids = [...new Set(logicalDeviceIds.filter(id => id.length > 0))];
    if (!ids.length) return Promise.resolve();
    const scope = [...ids].sort().join('\0');
    if (this.presence) {
      if (this.presence.scope === scope) return this.presence.promise;
      const previous = this.presence;
      previous.abort.abort();
      return previous.promise.catch(() => undefined).then(
        () => this.refreshPresence(ids),
      );
    }
    const abort = new AbortController();
    const promise = this.scanPresence(ids, abort.signal)
      .catch(error => {
        if (!(error instanceof Error) || error.message !== 'BLE_DIRECT_SCAN_CANCELLED') {
          throw error;
        }
      })
      .finally(() => {
        if (this.presence?.promise === promise) this.presence = undefined;
      });
    this.presence = { scope, promise, abort };
    return promise;
  }

  ensureReady(logicalDeviceId: string, scanTimeoutMs = 15_000): Promise<void> {
    if (!Number.isInteger(scanTimeoutMs) || scanTimeoutMs < 1) {
      return Promise.reject(new Error('BLE_DIRECT_SCAN_TIMEOUT_INVALID'));
    }
    if (this.active?.logicalDeviceId === logicalDeviceId
      && this.active.session.state === 'ready') {
      return this.active.session.synchronize();
    }
    if (this.opening?.logicalDeviceId === logicalDeviceId) return this.opening.promise;

    const presence = this.presence;
    if (presence) {
      presence.abort.abort();
      return presence.promise.catch(() => undefined).then(
        () => this.ensureReady(logicalDeviceId, scanTimeoutMs),
      );
    }

    const generation = ++this.generation;
    const abort = new AbortController();
    const promise = this.open(
      logicalDeviceId, generation, abort.signal, scanTimeoutMs,
    ).finally(() => {
      if (this.opening?.promise === promise) this.opening = undefined;
    });
    this.opening = { logicalDeviceId, promise, abort };
    return promise;
  }

  async disconnect(logicalDeviceId: string): Promise<void> {
    if (this.active?.logicalDeviceId !== logicalDeviceId
      && this.opening?.logicalDeviceId !== logicalDeviceId) return;
    this.generation += 1;
    this.opening?.abort.abort();
    this.opening = undefined;
    await this.closeActive();
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
    await this.ensureReady(logicalDeviceId);
    const active = this.active;
    if (!active || active.logicalDeviceId !== logicalDeviceId) {
      throw new Error('BLE_DIRECT_SESSION_NOT_READY');
    }
    await active.session.command(endpointKey, value);
  }

  private client(
    link: BleDirectRecordLink = new CapacitorBleDirectRecordLink(),
  ): BleDirectClient {
    return new BleDirectClient(
      link, this.api, this.credentials,
    );
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
  ): Promise<void> {
    const credential = await this.credentials.load(logicalDeviceId);
    if (!credential) throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    try {
      if (!sameBytes(credential.deviceInstanceId, expected)) {
        throw new Error('EDGE_GATEWAY_CHILD_INSTANCE_MISMATCH');
      }
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  private async installPresenceBundle(
    bundle: Awaited<ReturnType<HttpBlePresenceKeyApi['reveal']>>,
  ): Promise<void> {
    await this.savePresenceBundle(bundle);
    if (bundle.current.deviceConfirmed) return;
    const expectedVersion = bundle.previous?.version ?? 0;
    if (bundle.current.version !== expectedVersion + 1
      || (expectedVersion !== 0 && !bundle.previous)) {
      throw new Error('BLE_PRESENCE_PENDING_STATE_INVALID');
    }
    await this.ensureReady(bundle.logicalDeviceId);
    const active = this.active;
    if (!active || active.logicalDeviceId !== bundle.logicalDeviceId) {
      throw new Error('BLE_DIRECT_SESSION_NOT_READY');
    }
    const receipt = await active.session.replacePresenceKey(
      bundle.current.accessEpoch,
      expectedVersion,
      bundle.current.version,
      bundle.current.key,
    );
    try {
      const confirmed = await this.presenceApi.confirm(
        bundle.logicalDeviceId, receipt.encoded,
      );
      try {
        await this.savePresenceBundle(confirmed);
      } finally {
        clearBlePresenceKeyBundleSecrets(confirmed);
      }
    } finally {
      receipt.keyDigest.fill(0);
      receipt.proof.fill(0);
    }
  }

  private savePresenceBundle(
    bundle: Awaited<ReturnType<HttpBlePresenceKeyApi['reveal']>>,
  ): Promise<void> {
    return this.credentials.replacePresenceKeys(bundle.logicalDeviceId, [
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
  ): Promise<void> {
    await this.closeActive();
    if (generation !== this.generation) return;
    this.setConnection(logicalDeviceId, 'connecting');
    let session: BleDirectSession | undefined;
    const credential = await this.credentials.load(logicalDeviceId);
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
      if (target.profile.wireVersion === 2) return true;
      return (await matchAuthorizedBlePresence(target.profile, authorized))
        === logicalDeviceId;
    };
    try {
      const deadline = Date.now() + scanTimeoutMs;
      const rejected = new Set<string>();
      while (!session) {
        const remaining = deadline - Date.now();
        if (remaining < 1) throw new Error('BLE_DIRECT_SCAN_TIMEOUT');
        const target = await this.discoverDirect(
          remaining, rejected, signal, matchesTarget,
        );
        if (generation !== this.generation) return;
        try {
          session = await this.connect(logicalDeviceId, target);
        } catch (error) {
          if (!this.isCandidateMismatch(error)) throw error;
          rejected.add(target.device.deviceId);
        }
      }
      if (generation !== this.generation) {
        await session.close();
        return;
      }
      this.attach(logicalDeviceId, session);
      this.setConnection(logicalDeviceId, 'ready');
    } catch (error) {
      if (session) await session.close().catch(() => undefined);
      if (generation !== this.generation) return;
      this.setConnection(logicalDeviceId, 'stopped');
      throw error;
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
  }

  private attach(logicalDeviceId: string, session: BleDirectSession): void {
    const publish = (snapshot: DeviceV2TargetSnapshot) => {
      this.snapshots.set(logicalDeviceId, snapshot);
      if (snapshot.manifestAccepted && snapshot.manifest) {
        this.manifestCache.save(logicalDeviceId, snapshot.manifest);
      }
      for (const listener of this.stateListeners) listener(logicalDeviceId, snapshot);
    };
    const active: ActiveBleSession = {
      logicalDeviceId,
      session,
      detachState: session.store.subscribe((changedId, snapshot) => {
        if (changedId === logicalDeviceId) publish(snapshot);
      }),
      detachEvents: session.store.subscribeEvents(event => {
        if (event.logicalDeviceId === logicalDeviceId) {
          for (const listener of this.eventListeners) listener(event);
        }
      }),
      detachErrors: () => undefined,
    };
    active.detachErrors = session.subscribeErrors(() => {
      if (this.active !== active) return;
      this.detach(active);
      this.active = undefined;
      this.setConnection(logicalDeviceId, 'stopped');
    });
    this.active = active;
    publish(session.store.snapshot(logicalDeviceId));
  }

  private async closeActive(): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    this.detach(active);
    await active.session.close().catch(() => undefined);
    this.setConnection(active.logicalDeviceId, 'nearby');
    const snapshot = active.session.store.snapshot(active.logicalDeviceId);
    this.snapshots.set(active.logicalDeviceId, snapshot);
    for (const listener of this.stateListeners) {
      listener(active.logicalDeviceId, snapshot);
    }
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
      state = new BehaviorSubject<DeviceV2BleConnectionState>('idle');
      this.connectionStates.set(logicalDeviceId, state);
    }
    return state;
  }

  private setConnection(logicalDeviceId: string, state: DeviceV2BleConnectionState): void {
    const subject = this.connectionState(logicalDeviceId);
    if (subject.value !== state) subject.next(state);
  }

  private async scanPresence(
    logicalDeviceIds: readonly string[],
    signal: AbortSignal,
  ): Promise<void> {
    const authorized: AuthorizedBlePresenceCandidate[] = [];
    const scanning = new Set<string>();
    for (const logicalDeviceId of logicalDeviceIds) {
      if (this.connectionState(logicalDeviceId).value === 'ready') continue;
      this.setConnection(logicalDeviceId, 'idle');
      const credential = await this.credentials.load(logicalDeviceId).catch(() => undefined);
      if (!credential) continue;
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
    try {
      if (!authorized.length || signal.aborted) return;
      const targets = await discoverBlinkerDevices(BleApplicationMode.Direct, 2_500, signal);
      if (signal.aborted) return;
      for (const target of targets) {
        const logicalDeviceId = await matchAuthorizedBlePresence(
          target.profile,
          authorized,
        );
        if (logicalDeviceId) this.setConnection(logicalDeviceId, 'nearby');
      }
    } finally {
      for (const presence of authorized) {
        presence.deviceInstanceId.fill(0);
        presence.key.fill(0);
      }
      for (const logicalDeviceId of scanning) {
        if (this.connectionState(logicalDeviceId).value === 'scanning') {
          this.setConnection(logicalDeviceId, 'stopped');
        }
      }
    }
  }
}
