import { HttpClient } from '@angular/common/http';
import { isGatewayRoutedDevice } from '../device-v2/device-routing';
import { Injectable, OnDestroy } from '@angular/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { WiFiProv, type ProvisionOptions } from 'capacitor-wifiprov';
import { BehaviorSubject, Observable, Subject, Subscription, distinctUntilChanged, filter, map } from 'rxjs';

import { API } from '../../configs/api.config';
import {
  BleApplicationMode,
  BleControllerCredential,
  BleModeProfile,
  BleDirectClient,
  BleDirectCrypto,
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
  bleControllerCredentialChanges,
  discoverBlinkerDevice,
  discoverBlinkerDevices,
  sameBytes,
  base64UrlEncode,
} from '../device-v2/ble-direct';
import { HttpAccessRegistrationApi } from '../device-v2/ble-direct/access-registration-api';
import { SecureAccessRegistrationCheckpoints, AccessRegistrationCheckpoint } from '../device-v2/ble-direct/access-registration-checkpoints';
import { AccessRegistrationCoordinator, AccessRegistrationOutcome } from '../device-v2/ble-direct/access-registration-coordinator';
import { AccessRegistrationIntent, AccessRegistrationRootContext, accessRegistrationRootTuple } from '../device-v2/ble-direct/access-registration-contract';
import { invalidateKnownCredentialRoot } from '../device-v2/ble-direct/credential-root-lifecycle';
import { AuthorizedBlePresenceCandidate, matchAuthorizedBlePresenceCandidates,
  matchAuthorizedBlePresenceRegistrations } from '../device-v2/ble-direct/registration-presence-match';
import { HttpRegistrationPresenceApi } from '../device-v2/ble-direct/registration-presence-api';
import { RegistrationPresenceBinding } from '../device-v2/ble-direct/registration-presence-contract';
export { matchAuthorizedBlePresenceRegistrations } from '../device-v2/ble-direct/registration-presence-match';
export type { AuthorizedBlePresenceCandidate } from '../device-v2/ble-direct/registration-presence-match';
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
  DeviceV2TelemetryLease,
} from '../protocol/device-v2';
import { DeviceV2ManifestCache } from './device-v2-manifest-cache.service';
import { DataService } from './data.service';
import { AppVisibilityService } from './app-visibility.service';
import { BleDirectConnectionAdmission } from '../device-v2/ble-direct/transport';
import { environment } from '../../../environments/environment';
import { getServiceRegion } from '../../configs/service-region.config';
import { Bc5AcceptanceClient, snapshotBc5AcceptanceAdmission,
  type Bc5AcceptanceAdmission } from '../device-v2/ble-direct/bc5-acceptance-client';
import { Bc5InstallCheckpoints } from '../device-v2/ble-direct/bc5-install-checkpoint';
import { runBc5Acceptance, type Bc5AcceptanceStage } from '../device-v2/ble-direct/bc5-acceptance-run';
import { diagnoseBc5OriginalSourcePresence, verifyBc5PresenceAliasRecovery, verifyBc5RegisteredPresence,
  type Bc5RegisteredPresenceProof } from '../device-v2/ble-direct/bc5-registered-presence';
import { assertInitialCloudWifiProvAvailable, createInitialCloudWifiProvConsumer,
  type InitialCloudWifiContinuation } from '../device-v2/provisioning/wifiprov-initial-cloud-carrier';
import { wiFiProvCloudBoundary } from '../device-v2/provisioning/wifiprov-cloud-boundary';
import { readWiFiProvSoftApAttempt } from '../device-v2/provisioning/wifiprov-network-state';
import type { WiFiProvCloudReadPorts } from '../device-v2/provisioning/wifiprov-cloud-reconciliation';
import { WiFiProvCloudObservation } from '../device-v2/provisioning/wifiprov-cloud-reconciliation';
import { base64UrlDecode } from '../device-v2/base64url';
import { InitialNetworkCheckpoints, snapshotInitialNetworkAdmission,
  type InitialNetworkAdmission } from '../device-v2/ble-direct/initial-network-checkpoint';
import { assertInitialNetworkCommittedBinding, assertInitialNetworkSourceCredential, runInstalledKeyInitialNetwork as runInitialNetwork,
  type InitialNetworkStage } from '../device-v2/ble-direct/initial-network-run';

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
export interface DeviceV2AccessRegistrationSource { logicalDeviceId: string; displayName: string; }

type NearbyEvidence = 'direct' | 'alias' | false;

export function unambiguousBlePresenceCandidate(
  logicalDeviceIds: readonly string[],
): string | undefined {
  const candidates = [...new Set(logicalDeviceIds)];
  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function matchAuthorizedBlePresence(
  profile: BleModeProfile,
  candidates: readonly AuthorizedBlePresenceCandidate[],
): Promise<string | undefined> {
  return unambiguousBlePresenceCandidate(await matchAuthorizedBlePresenceRegistrations(profile, candidates));
}

function authorizedPresenceCandidates(
  logicalDeviceId: string,
  credential: BleControllerCredential,
): AuthorizedBlePresenceCandidate[] {
  const pending = credential.presenceBinding?.canWritePresence
    && credential.presenceBinding.materialOwnerLogicalDeviceId === logicalDeviceId ? credential.presenceWriteCandidate : undefined;
  // This helper is used for authenticated control selection, never the nearby
  // scan. Only the original writer can see its unresolved install candidate.
  return [...(credential.presenceKeys ?? []), ...(pending ? [pending] : [])].map(presence => ({
    logicalDeviceId,
    deviceInstanceId: credential.deviceInstanceId,
    accessEpoch: presence.accessEpoch,
    version: presence.version,
    key: presence.key,
    ...(credential.presenceBinding ? { registrationBinding: credential.presenceBinding } : {}),
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
export class DeviceV2BleService implements EdgeGatewayChildControl, OnDestroy {
  private readonly api: HttpBleEnrollmentApi;
  private readonly accessRegistrationApi: HttpAccessRegistrationApi;
  private readonly presenceApi: HttpBlePresenceKeyApi;
  private readonly registrationPresenceApi: HttpRegistrationPresenceApi;
  private readonly snapshots = new Map<string, DeviceV2TargetSnapshot>();
  private readonly stateListeners = new Set<(
    logicalDeviceId: string,
    snapshot: DeviceV2TargetSnapshot,
  ) => void>();
  private readonly eventListeners = new Set<(event: DeviceV2Event) => void>();
  private readonly connectionStates = new Map<
    string,
    { subject: BehaviorSubject<DeviceV2BleConnectionState>; nearby: BehaviorSubject<NearbyEvidence>;
      nearbyUntil: number; nearbySourceId?: string }
  >();
  private nearbyTimer?: ReturnType<typeof setTimeout>;
  private readonly accountLinks = new Set<BleDirectRecordLink>();
  private readonly accountSessions = new Set<BleDirectSession>();
  private active?: ActiveBleSession;
  private closing?: Promise<void>;
  private readonly ordinaryUses = new Map<string, Set<Promise<unknown>>>();
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
    logicalDeviceIds: readonly string[];
    promise: Promise<void>;
    abort: AbortController;
  };
  private readonly presenceSyncs = new Map<string, Promise<void>>();
  private readonly registrationPresenceReads = new Map<string, {
    abort: AbortController; promise: Promise<RegistrationPresenceBinding>; waiters: number;
  }>();
  private readonly credentialChanges = new Subject<string>();
  private readonly subscriptions = new Subscription();
  private readonly adapterEnabled = new BehaviorSubject<boolean | null>(null);
  private adapterMonitoring?: Promise<void>;
  private adapterNotificationsActive = false;
  private accountSessionEpoch: number;
  private appActive = true;
  private accessRegistration?: { abort: AbortController; context: DeviceV2AccountContext;
    continuation?: InitialCloudWifiContinuation; retainedPause: boolean };
  private accessRegistrationEpoch = 0;
  private accessRegistrationTargets = new WeakMap<BleDirectTarget, {
    context: DeviceV2AccountContext; epoch: number; signal: AbortSignal;
  }>();

  constructor(
    http: HttpClient,
    private readonly manifestCache: DeviceV2ManifestCache,
    private readonly data: DataService,
    appVisibility: AppVisibilityService,
  ) {
    this.api = new HttpBleEnrollmentApi(http);
    this.accessRegistrationApi = new HttpAccessRegistrationApi(http);
    this.presenceApi = new HttpBlePresenceKeyApi(http);
    this.registrationPresenceApi = new HttpRegistrationPresenceApi(http);
    this.accountSessionEpoch = data.sessionEpoch;
    this.subscriptions.add(data.authDataChanged.subscribe(() => {
      if (this.accountSessionEpoch === data.sessionEpoch) return;
      this.accountSessionEpoch = data.sessionEpoch;
      this.resetAccountSession();
    }));

    this.subscriptions.add(appVisibility.transitions?.subscribe(({ reason }) => {
      const operation = this.accessRegistration;
      if (!operation) return;
      operation.retainedPause = reason === 'pause' && operation.continuation?.pause() === true;
      // A true stop may arrive while active is already false; it cannot be
      // swallowed by the retained pause or revived on a later resume.
      if (reason === 'stop' || (reason === 'pause' && !operation.retainedPause)) operation.abort.abort();
    }));
    this.subscriptions.add(appVisibility.active.subscribe(active => {
      this.appActive = active;

      if (!active) {
        this.accessRegistrationEpoch += 1;
        if (!this.accessRegistration?.retainedPause) this.accessRegistration?.abort.abort();
        this.clearNearby();
        void this.disconnectAll().catch(() => undefined);
      }
    }));

    this.subscriptions.add(bleControllerCredentialChanges.subscribe(change => {
      // Closed profiles stay inert, including when WiFiProv writes an Admin.
      if (!environment.deployment.directAccess) return;
      let context: DeviceV2AccountContext;
      try { context = this.accountContext(); } catch { return; }
      if (change.authority !== context.authority || change.accountId !== context.accountId) return;
      if (this.presence?.logicalDeviceIds.includes(change.logicalDeviceId)) this.presence.abort.abort();
      this.clearNearby([change.logicalDeviceId, ...this.aliasTargets(change.logicalDeviceId)]);
      if (change.reason === 'root_invalidated' || change.reason === 'registration_deleted')
        void this.disconnect(change.logicalDeviceId).catch(() => undefined);
      // Only a local display re-read; this does not authenticate or reconnect.
      this.credentialChanges.next(change.logicalDeviceId);
    }));

    this.subscriptions.add(data.deviceDataLoader.subscribe(loaded => {
      if (!loaded) return;

      for (const [id, entry] of this.connectionStates) {
        if (entry.nearbySourceId && !this.canProjectNearbyAlias(entry.nearbySourceId, id)) this.clearNearby([id]);
      }

      const ids = new Set([this.active?.logicalDeviceId, this.opening?.logicalDeviceId]);

      for (const id of ids) {
        if (!id) continue;

        const device = data.getDevice(id);

        if (!device || device.config?.disabled) {
          void this.disconnect(id).catch(() => undefined);
        }
      }
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.resetAccountSession();
    this.credentialChanges.complete();
  }

  async accessRegistrationSources(): Promise<DeviceV2AccessRegistrationSource[]> {
    const context = this.accountContext(), result: DeviceV2AccessRegistrationSource[] = [];
    for (const id of [...new Set<string>(this.data.device?.list ?? [])]) {
      const device = this.data.getDevice(id);
      if (!device?.cloudEnabled || device.gatewayRouted || device.config?.isShared || device.config?.disabled) continue;
      const credential = await this.credentialStore(context).load(id);
      if (!credential) continue;
      try {
        this.assertAccount(context);
        if (this.isAccessRegistrationSource(credential)) result.push({ logicalDeviceId: id,
          displayName: device.name || device.config?.customName || device.deviceName || id });
      } finally { clearBleControllerCredentialSecrets(credential); }
    }
    this.assertAccount(context); return result;
  }

  accessRegistrationCheckpoints(): Promise<AccessRegistrationCheckpoint[]> {
    const context = this.accountContext();
    return this.accountResult(context, this.registrationCheckpoints(context).list());
  }

  // This is the original scanner. Results are transport handles only, and must
  // be explicitly selected before one fresh Method2; no MAC-based attribution.
  discoverAccessRegistrationTargets(signal: AbortSignal): Promise<BleDirectTarget[]> {
    return this.registrationOperation(signal, true, async (context, check, currentSignal) => {
      const targets = await discoverBlinkerDevices(BleApplicationMode.Direct, 2_500, currentSignal); check();
      for (const target of targets) this.accessRegistrationTargets.set(target,
        { context, epoch: this.accessRegistrationEpoch, signal });
      return targets;
    });
  }

  beginAccessRegistration(sourceLogicalDeviceId: string, name: string, signal: AbortSignal,
    selectedTarget?: BleDirectTarget): Promise<AccessRegistrationOutcome> {
    return this.registrationOperation(signal, true, async (context, check, currentSignal) => {
      if (selectedTarget) this.assertRegistrationTarget(selectedTarget, context);
      const pending = await this.registrationCheckpoints(context).list(); check();
      if (pending.some(value => value.request.sourceLogicalDeviceId === sourceLogicalDeviceId
        && !['closed', 'committed', 'rejected'].includes(value.phase))) throw Error('ACCESS_REGISTRATION_RECOVERY_REQUIRED');
      const credential = await this.requireAccessRegistrationSource(sourceLogicalDeviceId, context);
      try {
        check();
        const target = selectedTarget ?? await this.registrationTarget(sourceLogicalDeviceId, credential, currentSignal, check);
        check();
        if (selectedTarget) {
          await this.confirmInitialSourcePresence(credential, selectedTarget, context, check, currentSignal); check();
        }
        const crypto = new BleDirectCrypto(), fingerprint = await crypto.adminFingerprint(
          credential.controllerId, credential.controllerSecret);
        let expectedRoot: AccessRegistrationRootContext;
        try { check(); expectedRoot = { deviceInstanceId: base64UrlEncode(credential.deviceInstanceId),
          accessEpoch: credential.accessEpoch, controllerId: base64UrlEncode(credential.controllerId), credentialVersion: 1,
          adminFingerprint: base64UrlEncode(fingerprint), cloudCredentialVersion: credential.cloudContext!.credentialVersion }; }
        finally { fingerprint.fill(0); }
        return await this.registrationCoordinator(context, check, currentSignal).begin({
          requestId: base64UrlEncode(crypto.random(16)), sourceLogicalDeviceId, targetProduct: 'ble_direct', name, expectedRoot,
        }, target, currentSignal);
      } finally { clearBleControllerCredentialSecrets(credential); }
    });
  }

  // An explicitly selected initial v2 source can finish its already allocated
  // first key before prepare's pending-root guard. This never allocates,
  // rotates or resumes a shared-root/unknown registration operation.
  private async confirmInitialSourcePresence(credential: BleControllerCredential, target: BleDirectTarget,
    context: DeviceV2AccountContext, assertCurrent: () => void, signal: AbortSignal): Promise<void> {
    const check = () => { signal.throwIfAborted(); this.assertAccount(context); assertCurrent();
      if (!this.appActive) throw Error('BLE_DIRECT_APP_INACTIVE'); };
    check();
    if (credential.rootCredentialRef || target.profile.wireVersion !== 2) return;
    if (credential.source !== 'wifiprov' || credential.state !== 'active' || credential.keyRotation
      || !credential.cloudContext || credential.presenceWriteCandidate || credential.presenceBinding)
      throw Error('ACCESS_REGISTRATION_ROOT_OPERATION_PENDING');
    let bundle: Awaited<ReturnType<HttpBlePresenceKeyApi['reveal']>>;
    try { bundle = await this.presenceApi.reveal(credential.logicalDeviceId); }
    catch (error) {
      check();
      if (error instanceof GatewayHttpError && error.httpStatus === 404 && error.code === 'DEVICE_V2_PRESENCE_NOT_FOUND') return;
      throw error;
    }
    try {
      check();
      if (bundle.logicalDeviceId !== credential.logicalDeviceId || bundle.current.accessEpoch !== credential.accessEpoch)
        throw Error('ACCESS_REGISTRATION_ROOT_OPERATION_PENDING');
      if (bundle.current.deviceConfirmed) return;
      const local = credential.presenceKeys;
      if (bundle.current.version !== 1 || bundle.previous !== null || local?.length !== 1
        || local[0].state !== 'current' || local[0].version !== 1 || local[0].accessEpoch !== credential.accessEpoch
        || !sameBytes(local[0].key, bundle.current.key)) throw Error('ACCESS_REGISTRATION_ROOT_OPERATION_PENDING');
      check();
      const link = this.trackLink(new CapacitorBleDirectRecordLink({ signal, assertAcquire: check, assertActive: check }));
      let session: BleDirectSession | undefined;
      try {
        session = await this.client(link, context).connect(credential.logicalDeviceId, target);
        this.trackSession(session, link); check();
        if (session.logicalDeviceId !== credential.logicalDeviceId || session.state !== 'ready')
          throw Error('ACCESS_REGISTRATION_ROOT_OPERATION_PENDING');
        await this.installPresenceBundle(bundle, context, this.accountPresenceApi(context, check), false, { session, check }); check();
        const confirmed = await this.presenceApi.reveal(credential.logicalDeviceId);
        try {
          check();
          if (confirmed.logicalDeviceId !== credential.logicalDeviceId || !confirmed.current.deviceConfirmed
            || confirmed.current.accessEpoch !== credential.accessEpoch || confirmed.current.version !== 1 || confirmed.previous !== null
            || !sameBytes(confirmed.current.key, bundle.current.key) || !sameBytes(confirmed.current.keyDigest, bundle.current.keyDigest))
            throw Error('ACCESS_REGISTRATION_ROOT_OPERATION_PENDING');
        } finally { clearBlePresenceKeyBundleSecrets(confirmed); }
      } finally {
        // A failed close is not permission to start the second nonce-bound
        // registration connection. Propagate it instead of using a ready hint.
        if (session) await session.close(); else await link.disconnect();
        this.accountLinks.delete(link);
      }
      check();
    } finally { clearBlePresenceKeyBundleSecrets(bundle); }
  }

  continueAccessRegistration(requestId: string, signal: AbortSignal,
    selectedTarget?: BleDirectTarget): Promise<AccessRegistrationOutcome> {
    return this.registrationOperation(signal, true, async (context, check, currentSignal) => {
      const checkpoint = await this.registrationCheckpoints(context).load(requestId); check();
      if (!checkpoint?.intent || checkpoint.phase !== 'prepared' || checkpoint.intent.state !== 'prepared')
        throw Error('ACCESS_REGISTRATION_RECOVERY_REQUIRED');
      if (selectedTarget) this.assertRegistrationTarget(selectedTarget, context);
      const credential = await this.requireAccessRegistrationSource(checkpoint.request.sourceLogicalDeviceId, context);
      try {
        check();
        const target = selectedTarget ?? await this.registrationTarget(checkpoint.request.sourceLogicalDeviceId, credential, currentSignal, check);
        check(); return this.registrationCoordinator(context, check, currentSignal).resumePrepared(requestId, target, currentSignal);
      } finally { clearBleControllerCredentialSecrets(credential); }
    });
  }

  recoverAccessRegistration(requestId: string, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    return this.registrationOperation(signal, false, (context, check, currentSignal) =>
      this.registrationCoordinator(context, check, currentSignal).recover(requestId, currentSignal));
  }

  cancelAccessRegistration(requestId: string, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    return this.registrationOperation(signal, false, (context, check, currentSignal) =>
      this.registrationCoordinator(context, check, currentSignal).cancelPrepared(requestId, currentSignal));
  }

  clearAccessRegistration(requestId: string, signal: AbortSignal): Promise<void> {
    return this.registrationOperation(signal, false, (context, check, currentSignal) =>
      this.registrationCoordinator(context, check, currentSignal).clearResolved(requestId, currentSignal));
  }

  async retireDeletedRegistration(logicalDeviceId: string): Promise<{ cleanupPending: boolean }> {
    const context = this.accountContext();
    const check = () => this.assertAccount(context);
    await this.disconnect(logicalDeviceId); check();
    const store = new CapacitorBleControllerCredentialStore(() => { check(); return context; });
    const result = await store.removeDeletedRegistration(logicalDeviceId); check();
    return result;
  }

  async knownRootChanged(logicalDeviceId: string): Promise<void> {
    const context = this.accountContext(), check = () => this.assertAccount(context);
    await this.disconnect(logicalDeviceId); check();
    const store = new CapacitorBleControllerCredentialStore(() => { check(); return context; });
    await invalidateKnownCredentialRoot(store, logicalDeviceId, check); check();
  }

  private registrationCheckpoints(context: DeviceV2AccountContext): SecureAccessRegistrationCheckpoints {
    return new SecureAccessRegistrationCheckpoints(() => { this.assertAccount(context); return context; });
  }

  private registrationCoordinator(context: DeviceV2AccountContext, check: () => void, signal: AbortSignal): AccessRegistrationCoordinator {
    const store = new CapacitorBleControllerCredentialStore(() => { this.assertAccount(context); return context; });
    // The HTTP-only recovery path never acquires this lazy native link.
    const client = { authenticateAccessRegistration: async (...args: Parameters<BleDirectClient['authenticateAccessRegistration']>) => {
      check(); const link = this.trackLink(new CapacitorBleDirectRecordLink({ signal, assertAcquire: check, assertActive: check }));
      try {
        const authenticated = await this.client(link, context).authenticateAccessRegistration(...args);
        this.trackSession(authenticated.session, link);
        return authenticated;
      } catch (error) { await link.disconnect(); this.accountLinks.delete(link); throw error; }
    } };
    return new AccessRegistrationCoordinator(this.accessRegistrationApi, store, client, this.registrationCheckpoints(context), check,
      undefined, (intent, session, currentSignal) => this.initializeRegistrationPresence(intent, session, context, check, currentSignal));
  }

  // Only the just-committed explicit operation lends its new Method2 session.
  // The channel carries the target ID, but the original Cloud owns all key I/O.
  private async initializeRegistrationPresence(intent: AccessRegistrationIntent, session: BleDirectSession,
    context: DeviceV2AccountContext, assertCurrent: () => void, signal: AbortSignal): Promise<void> {
    const check = () => {
      signal.throwIfAborted(); this.assertAccount(context); assertCurrent();
      if (!this.appActive || session.state !== 'ready') throw Error('ACCESS_REGISTRATION_CANCELLED');
    };
    check();
    if (intent.state !== 'committed' || intent.device?.state !== 'active'
      || session.logicalDeviceId !== intent.targetLogicalDeviceId
      || intent.sourceLogicalDeviceId === intent.targetLogicalDeviceId)
      throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_CHANGED');
    const match = (binding: RegistrationPresenceBinding, id: string, writer: boolean) => {
      check();
      if (binding.logicalDeviceId !== id || binding.rootBindingId !== intent.rootBindingId
        || binding.bindingRevision !== intent.bindingRevision || binding.canWritePresence !== writer
        || binding.materialOwnerLogicalDeviceId !== intent.sourceLogicalDeviceId
        || JSON.stringify(accessRegistrationRootTuple(binding.expectedRoot)) !== JSON.stringify(accessRegistrationRootTuple(intent.expectedRoot)))
        throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_CHANGED');
    };
    let owner = await this.readRegistrationPresence(intent.sourceLogicalDeviceId, context, signal);
    match(owner, intent.sourceLogicalDeviceId, true);
    if (!owner.keys.length) {
      const api = this.accountPresenceApi(context, check);
      // One logical initialization only. A lost install/confirm stays pending;
      // neither this operation nor HTTP-only recovery retries another write.
      const bundle = await syncOrAllocateBlePresenceKey(api, intent.sourceLogicalDeviceId, newPresenceOperationId());
      try {
        check();
        if (bundle.logicalDeviceId !== intent.sourceLogicalDeviceId
          || bundle.current.accessEpoch !== intent.expectedRoot.accessEpoch
          || (bundle.previous && bundle.previous.accessEpoch !== intent.expectedRoot.accessEpoch))
          throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_CHANGED');
        await this.installPresenceBundle(bundle, context, api, false, { session, check }); check();
        owner = await this.readRegistrationPresence(intent.sourceLogicalDeviceId, context, signal);
        match(owner, intent.sourceLogicalDeviceId, true);
        if (!owner.keys.some(key => key.version === bundle.current.version
          && key.key === base64UrlEncode(bundle.current.key) && key.keyDigest === base64UrlEncode(bundle.current.keyDigest)))
          throw Error('ACCESS_REGISTRATION_PRESENCE_SETUP_REQUIRED');
      } finally { clearBlePresenceKeyBundleSecrets(bundle); }
    }
    if (!owner.keys.length) throw Error('ACCESS_REGISTRATION_PRESENCE_SETUP_REQUIRED');
    const target = await this.readRegistrationPresence(intent.targetLogicalDeviceId, context, signal);
    match(target, intent.targetLogicalDeviceId, false);
    if (!owner.keys.some(key => target.keys.some(other => key.version === other.version
      && key.accessEpoch === other.accessEpoch && key.keyDigest === other.keyDigest && key.key === other.key)))
      throw Error('ACCESS_REGISTRATION_PRESENCE_SETUP_REQUIRED');
  }

  private isAccessRegistrationSource(value: BleControllerCredential): boolean {
    return value.source === 'wifiprov' && value.state === 'active' && !!value.cloudContext && !value.keyRotation
      && (value.permissions & 0x08) !== 0;
  }

  private async requireAccessRegistrationSource(id: string, context: DeviceV2AccountContext): Promise<BleControllerCredential> {
    const device = this.data.getDevice(id), value = await this.credentialStore(context).load(id);
    try { this.assertAccount(context); }
    catch (error) { if (value) clearBleControllerCredentialSecrets(value); throw error; }
    if (!value || !this.isAccessRegistrationSource(value) || !device?.cloudEnabled || device.gatewayRouted
      || device.config?.isShared || device.config?.disabled) {
      if (value) clearBleControllerCredentialSecrets(value);
      throw Error('LOCAL_ADMIN_CREDENTIAL_REQUIRED');
    }
    return value;
  }

  private registrationTarget(id: string, credential: BleControllerCredential, signal: AbortSignal,
    check: () => void): Promise<BleDirectTarget> {
    const candidates = authorizedPresenceCandidates(id, credential);
    if (!candidates.length) throw Error('BLE_DIRECT_PRESENCE_CREDENTIAL_NOT_FOUND');
    return this.discoverDirect(15_000, undefined, signal, async target => {
      const matched = await matchAuthorizedBlePresence(target.profile, candidates); check(); return matched === id;
    });
  }

  private assertRegistrationTarget(target: BleDirectTarget, context: DeviceV2AccountContext): void {
    const observed = this.accessRegistrationTargets.get(target);
    if (!observed || observed.signal.aborted || observed.epoch !== this.accessRegistrationEpoch || !sameAccountContext(observed.context, context)
      || target.profile.mode !== BleApplicationMode.Direct) throw Error('ACCESS_REGISTRATION_TARGET_REQUIRED');
  }

  /** Only called by the pinned internal Beta entry. Keep the existing BLE
   * owner through the explicit handoff and the native Local release proof. */
  runBc5Acceptance(admission: Bc5AcceptanceAdmission, network: ProvisionOptions, signal: AbortSignal,
    read: WiFiProvCloudReadPorts['read'], stage: (value: Bc5AcceptanceStage) => void,
    continuation: InitialCloudWifiContinuation) {
    return this.registrationOperation(signal, true, async (context, current, signal, assertContext) => {
      const { authority, check } = this.bc5Authority(admission, context, current);
      const assertCloud = () => this.assertBc5Cloud(check, signal);
      const carrier = createInitialCloudWifiProvConsumer(WiFiProv, network, check, wiFiProvCloudBoundary, {
        gate: continuation,
        assertContext: () => { assertContext(); this.assertBc5Account(admission, context); },
      });
      const link = this.trackLink(new CapacitorBleDirectRecordLink({ signal, assertAcquire: check, assertActive: check }));
      try {
        return await runBc5Acceptance({ authority, direct: this.client(link, context), carrier, stage,
          checkCarrier: () => assertInitialCloudWifiProvAvailable(WiFiProv, signal, check),
          cloud: { signal, assertCurrent: check, assertCloud, read }, selectSource: async () => {
            const id = admission.sourceLogicalDeviceId;
            const device = this.data.getDevice(id), value = await this.credentialStore(context).load(id);
            try {
              check();
              if (!device || device.cloudEnabled !== false || device.gatewayRouted || device.config?.isShared || device.config?.disabled
                || !value || value.state !== 'active' || (value.source ?? 'enrollment') !== 'enrollment'
                || value.cloudContext || value.keyRotation || value.permissions !== 15)
                throw Error('BC5_BLE_ONLY_SOURCE_REQUIRED');
              return await this.registrationTarget(id, value, signal, check);
            } finally { if (value) clearBleControllerCredentialSecrets(value); }
          },
        });
      } finally {
        await link.disconnect(); // Do not drop an owner whose native release is unconfirmed.
        this.accountLinks.delete(link);
      }
    }, continuation);
  }

  recoverBc5Acceptance(admission: Bc5AcceptanceAdmission, signal: AbortSignal) {
    return this.registrationOperation(signal, false, async (context, current, signal) => {
      const { authority, check } = this.bc5Authority(admission, context, current);
      await this.assertBc5Cloud(check, signal);
      return authority.recoverInstall(signal);
    });
  }

  /** Existing installed Key, empty first network only. No prepare/issue/install
   * or Key reveal port is available to the new coordinator. */
  runInstalledKeyInitialNetwork(value: InitialNetworkAdmission, original: Bc5AcceptanceAdmission,
    network: ProvisionOptions, signal: AbortSignal, read: WiFiProvCloudReadPorts['read'],
    stage: (value: InitialNetworkStage) => void, continuation: InitialCloudWifiContinuation) {
    const admission = snapshotInitialNetworkAdmission(value);
    const pinnedOriginal = snapshotBc5AcceptanceAdmission(original);
    return this.registrationOperation(signal, true, async (context, current, stop, assertContext) => {
      const check = () => { current(); this.assertInitialNetworkAccount(admission, context); };
      const { authority } = this.bc5Authority(pinnedOriginal, context, check);
      const checkpoints = new InitialNetworkCheckpoints(admission, check);
      const link = this.trackLink(new CapacitorBleDirectRecordLink({ signal: stop, assertAcquire: check, assertActive: check }));
      try {
        return await runInitialNetwork({ admission, checkpoints, direct: this.client(link, context), stage,
          cloud: { signal: stop, assertCurrent: check, assertCloud: () => this.assertBc5Cloud(check, stop), read },
          checkCarrier: () => assertInitialCloudWifiProvAvailable(WiFiProv, stop, check),
          checkAuthority: async () => {
            const exact = await authority.readExactCommitted(stop); check();
            assertInitialNetworkCommittedBinding(admission, exact.checkpoint.issued);
            // The exact reader checks both current owned roles and absence of
            // active gateway routes in one snapshot. A cold tools route need
            // not have loaded the homepage's display-only device catalog.
          },
          selectSource: async () => {
            const credential = await this.credentialStore(context).load(admission.sourceLogicalDeviceId);
            try {
              check();
              assertInitialNetworkSourceCredential(admission, credential);
              return await this.registrationTarget(admission.sourceLogicalDeviceId, credential, stop, check);
            } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
          },
          createCarrier: beforeSubmit => createInitialCloudWifiProvConsumer(WiFiProv, network, check, wiFiProvCloudBoundary, {
            gate: continuation, beforeSubmit,
            diagnostic: (phase, reason) => console.warn('INITIAL_NETWORK_WIFI_STOP', phase, reason),
            assertContext: () => { assertContext(); this.assertInitialNetworkAccount(admission, context); },
          }),
        });
      } finally {
        await link.disconnect();
        this.accountLinks.delete(link);
      }
    }, continuation);
  }

  inspectInstalledKeyInitialNetwork(value: InitialNetworkAdmission, signal: AbortSignal, read: WiFiProvCloudReadPorts['read']) {
    const admission = snapshotInitialNetworkAdmission(value);
    return this.registrationOperation(signal, false, async (context, current, stop) => {
      const check = () => { current(); this.assertInitialNetworkAccount(admission, context); };
      const checkpoint = await new InitialNetworkCheckpoints(admission, check).inspect();
      if (!checkpoint?.wifiDispatchedAt || checkpoint.phase === 'wifi-rejected') return { checkpoint, cloud: 'not-checked' as const };
      const cloud = await new WiFiProvCloudObservation({ attemptedAt: checkpoint.wifiDispatchedAt,
        deviceInstanceId: base64UrlDecode(admission.expectedRoot.deviceInstanceId, 16),
        identity: { logicalDeviceId: admission.targetLogicalDeviceId, credentialVersion: admission.cloudCredentialVersion,
          locator: admission.existingLocator },
      }, true, 'metadata-reference').read({ signal: stop, assertCurrent: check, closeLocal: () => this.assertBc5Cloud(check, stop),
        assertCloud: () => this.assertBc5Cloud(check, stop), read });
      return { checkpoint, cloud }; // No checkpoint mutation or replay on recovery.
    });
  }

  private assertInitialNetworkAccount(admission: InitialNetworkAdmission, context: DeviceV2AccountContext): void {
    if (context.authority !== admission.origin || API.BASE_URL !== admission.origin || context.accountId !== admission.ownerUserId
      || this.data.auth?.uuid !== admission.ownerUserId || getServiceRegion() !== admission.region)
      throw Error('INITIAL_CLOUD_NETWORK_ACCOUNT_CHANGED');
  }

  // Explicit preflight for the private, committed reverse-registration flow.
  // Never called by homepage scanning, ordinary recovery or control.
  verifyCommittedBc5Presence(admission: Bc5AcceptanceAdmission, signal: AbortSignal): Promise<Bc5RegisteredPresenceProof> {
    return this.registrationOperation(signal, false, async (context, current, signal) => {
      const { authority, check } = this.bc5Authority(admission, context, current);
      const store = this.credentialStore(context);
      let proof: Bc5RegisteredPresenceProof | undefined;
      await this.assertBc5Cloud(check, signal);
      await authority.recoverInstall(signal, async (issued, committed) => {
        const source = await store.load(issued.sourceLogicalDeviceId);
        try {
          check();
          if (!source) throw Error('BC5_BLE_ONLY_SOURCE_REQUIRED');
          proof = await verifyBc5RegisteredPresence({ issued, committed, source, signal, assertCurrent: check,
            read: (id, signal) => this.registrationPresenceApi.read(id, signal) });
        } finally { if (source) clearBleControllerCredentialSecrets(source); }
      });
      check();
      if (!proof) throw Error('BC5_REGISTERED_PRESENCE_COMMIT_REQUIRED');
      return proof;
    });
  }

  // Keep the exact committed read, two Presence reads and final local CAS in
  // one foreground account operation. The caller cannot inject a proof.
  restoreCommittedBc5PresenceAlias(admission: Bc5AcceptanceAdmission, signal: AbortSignal): Promise<boolean> {
    return this.registrationOperation(signal, false, async (context, current, signal) => {
      const { authority, check } = this.bc5Authority(admission, context, current);
      await this.assertBc5Cloud(check, signal);
      const exact = await authority.readExactCommitted(signal);
      check();
      const store = this.credentialStore(context);
      const source = await store.load(exact.checkpoint.issued.sourceLogicalDeviceId);
      try {
        check();
        if (!source) throw Error('BC5_BLE_ONLY_SOURCE_REQUIRED');
        const proof = await verifyBc5PresenceAliasRecovery({ ...exact, scope: context, source, signal,
          assertCurrent: check, read: (id, signal) => this.registrationPresenceApi.read(id, signal) });
        return await store.restoreCommittedBc5PresenceAlias(proof, check);
      } finally { if (source) clearBleControllerCredentialSecrets(source); }
    });
  }

  // Internal source-only probe: no exact-commit request, target read, or CAS.
  diagnoseBc5SourcePresence(admission: Bc5AcceptanceAdmission, signal: AbortSignal): Promise<void> {
    const pinned = snapshotBc5AcceptanceAdmission(admission);
    return this.registrationOperation(signal, false, async (context, current, signal) => {
      const check = () => { current(); this.assertBc5Account(pinned, context); };
      await this.assertBc5Cloud(check, signal);
      const checkpoint = await new Bc5InstallCheckpoints(pinned, check).load();
      if (!checkpoint?.armedAt) throw Error('BC5_REGISTERED_PRESENCE_COMMIT_REQUIRED');
      const source = await this.credentialStore(context).load(checkpoint.issued.sourceLogicalDeviceId);
      try {
        check();
        if (!source) throw Error('BC5_BLE_ONLY_SOURCE_REQUIRED');
        await diagnoseBc5OriginalSourcePresence({ issued: checkpoint.issued, source, signal, assertCurrent: check,
          read: (id, signal) => this.registrationPresenceApi.read(id, signal) });
      } finally { if (source) clearBleControllerCredentialSecrets(source); }
    });
  }

  private bc5Authority(admission: Bc5AcceptanceAdmission, context: DeviceV2AccountContext, current: () => void) {
    const check = () => { current(); this.assertBc5Account(admission, context); };
    check();
    const authority = new Bc5AcceptanceClient(admission, () => ({ accountId: this.data.auth?.uuid ?? '',
      region: getServiceRegion(), token: this.data.auth?.token ?? '' }), check);
    return { authority, check };
  }

  private assertBc5Account(admission: Bc5AcceptanceAdmission, context: DeviceV2AccountContext): void {
    if (context.authority !== API.BASE_URL || API.BASE_URL !== admission.origin || this.data.auth?.uuid !== context.accountId
      || context.accountId !== admission.ownerUserId || getServiceRegion() !== admission.region)
      throw Error('BC5_ACCEPTANCE_ACCOUNT_CHANGED');
  }

  private async assertBc5Cloud(check: () => void, signal: AbortSignal): Promise<void> {
    check();
    if (wiFiProvCloudBoundary.blocked || await readWiFiProvSoftApAttempt(WiFiProv, signal) || wiFiProvCloudBoundary.blocked)
      throw Error('WIFIPROV_CLOUD_BOUNDARY_BUSY');
    check();
  }

  private async registrationOperation<T>(signal: AbortSignal, radio: boolean,
    work: (context: DeviceV2AccountContext, check: () => void, signal: AbortSignal, checkContext: () => void) => Promise<T>,
    continuation?: InitialCloudWifiContinuation): Promise<T> {
    const context = this.accountContext(); signal.throwIfAborted();
    if (!this.appActive) throw Error('BLE_DIRECT_APP_INACTIVE');
    if (this.accessRegistration) throw Error('ACCESS_REGISTRATION_BUSY');
    const operation = this.accessRegistration = { context, abort: new AbortController(), continuation, retainedPause: false };
    const cancel = () => operation.abort.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const checkContext = () => {
      operation.abort.signal.throwIfAborted(); this.assertAccount(context);
      if (this.accessRegistration !== operation) throw Error('ACCESS_REGISTRATION_CANCELLED');
    };
    const check = () => { checkContext(); if (!this.appActive) throw Error('ACCESS_REGISTRATION_CANCELLED'); };
    try {
      check();
      if (radio) {
        const presence = this.presence; presence?.abort.abort(); await presence?.promise.catch(() => undefined); check();
        const opening = this.opening;
        if (opening) { opening.abort.abort(); await opening.promise.catch(error => {
          if (error instanceof Error && error.message === 'BLE_DIRECT_NATIVE_RELEASE_FAILED') throw error;
        }); check(); }
        await this.closeActive(); check(); if (this.closing) await this.closing; check();
      }
      const result = await work(context, check, operation.abort.signal, checkContext); check(); return result;
    } finally {
      signal.removeEventListener('abort', cancel);
      if (this.accessRegistration === operation) this.accessRegistration = undefined;
    }
  }

  discoverProvisioningDevices(timeoutMs?: number): Promise<BleDirectTarget[]> {
    if (!environment.deployment.directAccess) return Promise.reject(new Error('BLE_DIRECT_DEPLOYMENT_UNAVAILABLE'));
    return discoverBlinkerDevices(BleApplicationMode.Provisioning, timeoutMs);
  }

  discoverDirect(
    timeoutMs?: number,
    excludedDeviceIds?: ReadonlySet<string>,
    signal?: AbortSignal,
    matcher?: BleDirectTargetMatcher,
  ): Promise<BleDirectTarget> {
    if (!environment.deployment.directAccess) return Promise.reject(new Error('BLE_DIRECT_DEPLOYMENT_UNAVAILABLE'));
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

  adapterEnabledSnapshot(): boolean | null {
    return this.adapterEnabled.value;
  }

  connectionSnapshot(logicalDeviceId: string): DeviceV2BleConnectionState {
    return this.connectionState(logicalDeviceId).value;
  }

  watchNearby(logicalDeviceId: string): Observable<boolean> {
    this.connectionState(logicalDeviceId);
    return this.connectionStates.get(logicalDeviceId)!.nearby.pipe(map(value => value === 'direct'), distinctUntilChanged());
  }

  watchNearbyAlias(logicalDeviceId: string): Observable<boolean> {
    this.connectionState(logicalDeviceId);
    this.expireNearby();
    return this.connectionStates.get(logicalDeviceId)!.nearby.pipe(map(value => value === 'alias'), distinctUntilChanged());
  }

  watchCredentialChanges(logicalDeviceId: string): Observable<void> {
    return this.credentialChanges.pipe(
      filter(id => id === logicalDeviceId), map(() => undefined),
    );
  }

  nearbySnapshot(logicalDeviceId: string): boolean {
    this.connectionState(logicalDeviceId);
    this.expireNearby();
    return this.connectionStates.get(logicalDeviceId)!.nearby.value === 'direct';
  }

  async hasActiveCredential(logicalDeviceId: string): Promise<boolean> {
    if (!environment.deployment.directAccess) return false;
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
    if (!environment.deployment.directAccess) return false;
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

  private async readRegistrationPresence(id: string, context: DeviceV2AccountContext,
    signal?: AbortSignal): Promise<RegistrationPresenceBinding> {
    const check = () => {
      this.assertAccount(context); signal?.throwIfAborted();
      if (!this.appActive) throw Error('BLE_DIRECT_APP_INACTIVE');
    };
    check();
    const key = accountOperationKey(context, id);
    let reading = this.registrationPresenceReads.get(key);
    if (!reading) {
      const abort = new AbortController();
      const current = () => { this.assertAccount(context); abort.signal.throwIfAborted();
        if (!this.appActive) throw Error('BLE_DIRECT_APP_INACTIVE'); };
      const store = this.credentialStore(context);
      const work = async () => {
        const binding = await this.registrationPresenceApi.read(id, abort.signal); current();
        await store.applyRegistrationPresence(binding); current();
        // This is one exact named material owner, not all cards with the same
        // instance/root. Its own endpoint independently authorizes that card.
        if (binding.materialOwnerLogicalDeviceId !== id) {
          const ownerId = binding.materialOwnerLogicalDeviceId;
          const device = this.data.getDevice(ownerId);
          const owner = device && !device.config?.disabled && !device.config?.isShared
            ? await store.load(ownerId) : undefined;
          try {
            current();
            if (owner?.state === 'active' && owner.rootCredentialRef === binding.rootBindingId
              && owner.presenceBinding?.bindingRevision !== binding.bindingRevision) {
              const ownerBinding = await this.registrationPresenceApi.read(ownerId, abort.signal); current();
              if (ownerBinding.rootBindingId !== binding.rootBindingId
                || ownerBinding.bindingRevision !== binding.bindingRevision)
                throw Error('ACCESS_REGISTRATION_PRESENCE_CONTEXT_CHANGED');
              await store.applyRegistrationPresence(ownerBinding); current();
            }
          } finally { if (owner) clearBleControllerCredentialSecrets(owner); }
        }
        return binding;
      };
      const record = { abort, waiters: 0, promise: undefined as unknown as Promise<RegistrationPresenceBinding> };
      record.promise = work().finally(() => {
        if (this.registrationPresenceReads.get(key) === record) this.registrationPresenceReads.delete(key);
      });
      reading = record; this.registrationPresenceReads.set(key, record);
    }
    reading.waiters++;
    let cancelled: (() => void) | undefined;
    try {
      const value = signal ? await Promise.race([reading.promise, new Promise<never>((_resolve, reject) => {
        cancelled = () => reject(signal.reason ?? Error('BLE_DIRECT_CONNECT_CANCELLED'));
        signal.addEventListener('abort', cancelled, { once: true });
        if (signal.aborted) cancelled();
      })]) : await reading.promise;
      check(); return value;
    } finally {
      if (cancelled) signal?.removeEventListener('abort', cancelled);
      if (--reading.waiters === 0 && this.registrationPresenceReads.get(key) === reading) reading.abort.abort();
    }
  }

  private async performPresenceSync(
    logicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    let registered = false;
    try { this.assertAccount(context); registered = credential?.rootCredentialRef !== undefined; }
    finally { if (credential) clearBleControllerCredentialSecrets(credential); }
    if (registered) {
      const binding = await this.readRegistrationPresence(logicalDeviceId, context);
      if (!binding.canWritePresence) {
        if (!binding.keys.length) throw Error('ACCESS_REGISTRATION_PRESENCE_SETUP_REQUIRED');
        return; // A registered alias never allocates or installs another key.
      }
    }
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
    const credential = await this.credentialStore(context).load(logicalDeviceId);
    let registered = false;
    try { this.assertAccount(context); registered = credential?.rootCredentialRef !== undefined; }
    finally { if (credential) clearBleControllerCredentialSecrets(credential); }
    if (registered && !(await this.readRegistrationPresence(logicalDeviceId, context)).canWritePresence)
      throw Error('ACCESS_REGISTRATION_SHARED_ROOT_OPERATION_REQUIRED');
    const api = this.accountPresenceApi(context);
    const existing = await api.sync(logicalDeviceId);
    try {
      if (!existing.current.deviceConfirmed) {
        await this.installPresenceBundle(existing, context, api, true);
        await this.performPresenceSync(logicalDeviceId, context);
        return;
      }
      const rotated = await api.rotate(
        logicalDeviceId, existing.current.version, idempotencyKey,
      );
      try {
        await this.installPresenceBundle(rotated, context, api, true);
      } finally {
        clearBlePresenceKeyBundleSecrets(rotated);
      }
      await this.performPresenceSync(logicalDeviceId, context);
    } finally {
      clearBlePresenceKeyBundleSecrets(existing);
    }
  }

  refreshPresence(logicalDeviceIds: readonly string[], signal?: AbortSignal): Promise<void> {
    if (!environment.deployment.directAccess) return Promise.resolve();
    if (!this.appActive) return Promise.reject(new Error('BLE_SCAN_BACKGROUND'));
    const context = this.accountContext();
    if (signal?.aborted) return Promise.resolve();
    const closing = this.closing ?? (this.opening?.abort.signal.aborted ? this.opening.promise.catch(error => {
      if (error instanceof Error && error.message === 'BLE_DIRECT_NATIVE_RELEASE_FAILED') throw error;
    }) : undefined);
    if (closing) return closing.then(() => {
      this.assertAccount(context);
      return this.refreshPresence(logicalDeviceIds, signal);
    });
    if (this.active || this.opening || this.accessRegistration) return Promise.resolve();
    const ids = [...new Set(logicalDeviceIds.filter(id => id.length > 0))];
    if (!ids.length) return Promise.resolve();
    const scope = accountOperationKey(context, [...ids].sort().join('\0'));
    if (this.presence) {
      if (this.presence.scope === scope) return this.presence.promise;
      const previous = this.presence;
      previous.abort.abort();
      return previous.promise.catch(() => undefined).then(
        () => this.refreshPresence(ids, signal),
      );
    }
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const promise = this.scanPresence(ids, abort.signal, context)
      .catch(error => {
        if (!(error instanceof Error) || !['BLE_DIRECT_SCAN_CANCELLED', 'BLE_SCAN_CANCELLED'].includes(error.message)) {
          throw error;
        }
      })
      .finally(() => {
        signal?.removeEventListener('abort', cancel);
        if (this.presence?.promise === promise) this.presence = undefined;
      });
    this.presence = { scope, logicalDeviceIds: ids, promise, abort };
    return promise;
  }

  ensureReady(
    logicalDeviceId: string,
    scanTimeoutMs = 15_000,
    context = this.accountContext(),
    admission?: BleDirectConnectionAdmission,
  ): Promise<void> {
    if (!environment.deployment.directAccess) throw new Error('BLE_DIRECT_DEPLOYMENT_UNAVAILABLE');
    if (!this.appActive) throw new Error('BLE_DIRECT_APP_INACTIVE');
    if (this.accessRegistration) throw Error('ACCESS_REGISTRATION_BUSY');

    void this.ensureAdapterMonitoring();

    if (this.adapterEnabled.value === false) throw new Error('BLE_ADAPTER_DISABLED');

    const device = this.data.getDevice(logicalDeviceId);

    if (this.data.deviceDataLoader.value && (!device || device.config?.disabled)) {
      throw new Error('DEVICE_V2_DEVICE_UNAVAILABLE');
    }

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
      const generation = this.generation;

      return this.opening.promise.catch(() => undefined).then(() => {
        if (generation !== this.generation) throw new Error('BLE_DIRECT_CONNECT_CANCELLED');

        return this.ensureReady(logicalDeviceId, scanTimeoutMs, context, admission);
      });
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

  private async disconnectAll(): Promise<void> {
    for (const read of this.registrationPresenceReads.values()) read.abort.abort();
    this.registrationPresenceReads.clear();
    // Invalidate queued acquisitions before releasing any native resources.
    this.generation += 1;
    this.presence?.abort.abort();

    const ids = new Set([this.active?.logicalDeviceId, this.opening?.logicalDeviceId]);

    await Promise.all([...ids].filter((id): id is string => !!id).map(id => this.disconnect(id)));
  }

  async disconnect(logicalDeviceId: string, admission?: BleDirectConnectionAdmission): Promise<void> {
    await this.disconnectMatching(logicalDeviceId, owner => !admission || owner === admission);
  }

  // A page's retirement is not a global disconnect. Recheck account, native
  // generation and live demand after any existing command/Presence exchange.
  async releaseIdleOrdinary(logicalDeviceId: string, inUse: () => boolean): Promise<void> {
    const owner = this.opening ?? this.active;
    if (!owner || owner.logicalDeviceId !== logicalDeviceId || owner.admission) return;
    const { context } = owner, generation = this.generation;
    const key = accountOperationKey(context, logicalDeviceId);
    const same = () => this.appActive && this.generation === generation && this.isCurrentAccount(context) && !inUse();
    while (same()) {
      const work = this.ordinaryUses.get(key);
      if (work?.size) { await Promise.allSettled([...work]); continue; }
      if (this.closing) { await this.closing; continue; }
      return this.disconnectMatching(logicalDeviceId, admission => !admission, same);
    }
  }

  private async disconnectMatching(logicalDeviceId: string,
    matches: (owner?: BleDirectConnectionAdmission) => boolean, allowed = () => true): Promise<void> {
    if (this.closing) await this.closing;
    if (!allowed()) return;
    const opening = this.opening?.logicalDeviceId === logicalDeviceId
      && matches(this.opening.admission) ? this.opening : undefined;
    const active = this.active?.logicalDeviceId === logicalDeviceId
      && matches(this.active.admission);
    if (!active && !opening) return;
    const generation = ++this.generation;
    opening?.abort.abort();
    if (active) await this.closeActive();
    // Cancellation settles logical work first. Do not report physical release
    // while the original opening can still deliver a late native connection.
    if (opening) await opening.promise.catch(error => {
      if (error instanceof Error && error.message === 'BLE_DIRECT_NATIVE_RELEASE_FAILED') {
        this.closing ??= opening.promise; // Rejected physical barrier survives opening retirement.
        throw error;
      }
    });
    if (generation === this.generation) {
      this.setConnection(logicalDeviceId, this.nearbySnapshot(logicalDeviceId) ? 'nearby' : 'stopped');
    }
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
    await this.useOrdinaryDirect(logicalDeviceId, context, async () => {
      if (!this.isGatewayChild(logicalDeviceId)) await this.ensureReady(logicalDeviceId, 15_000, context);
      await this.commandConnected(logicalDeviceId, endpointKey, value, context);
    });
  }

  private useOrdinaryDirect<T>(logicalDeviceId: string, context: DeviceV2AccountContext, operation: () => Promise<T>): Promise<T> {
    const key = accountOperationKey(context, logicalDeviceId);
    const users = this.ordinaryUses.get(key) ?? new Set<Promise<unknown>>();
    this.ordinaryUses.set(key, users);
    const task = Promise.resolve().then(operation).finally(() => {
      users.delete(task);
      if (!users.size && this.ordinaryUses.get(key) === users) this.ordinaryUses.delete(key);
    });
    users.add(task);
    return task;
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

  // Page-owned telemetry never acquires a radio connection. Its lease belongs
  // to the already authenticated session, including while Open is in flight.
  async openTelemetryConnected(logicalDeviceId: string, endpointKeys: string[],
    intervalMs: number): Promise<DeviceV2TelemetryLease> {
    const context = this.accountContext();
    this.assertAccount(context);
    const active = this.active;
    const assertActive = (): void => {
      this.assertAccount(context);
      if (!active || this.active !== active || active.logicalDeviceId !== logicalDeviceId
        || !sameAccountContext(active.context, context) || active.session.state !== 'ready') {
        throw new Error('BLE_DIRECT_SESSION_NOT_READY');
      }
      active.admission?.signal.throwIfAborted();
      active.admission?.assertActive();
    };
    assertActive();
    const lease = await active!.session.openTelemetry(endpointKeys, intervalMs);
    try {
      assertActive();
      return lease;
    } catch (error) {
      await lease.close().catch(() => undefined);
      throw error;
    }
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
    if (!environment.deployment.directAccess) throw new Error('BLE_DIRECT_DEPLOYMENT_UNAVAILABLE');
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
    assertCurrent: () => void = () => undefined,
  ): Pick<HttpBlePresenceKeyApi, 'sync' | 'allocate' | 'rotate' | 'confirm'> {
    const call = async <T extends Awaited<ReturnType<HttpBlePresenceKeyApi['sync']>>>(
      operation: () => Promise<T>,
    ): Promise<T> => {
      this.assertAccount(context); assertCurrent();
      const result = await operation();
      try {
        this.assertAccount(context); assertCurrent();
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
    for (const read of this.registrationPresenceReads.values()) read.abort.abort();
    this.registrationPresenceReads.clear();
    this.accessRegistrationEpoch += 1;
    this.accessRegistration?.abort.abort();
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
    for (const state of this.connectionStates.values()) {
      state.nearbyUntil = 0; state.nearbySourceId = undefined; state.nearby.next(false); state.subject.next('idle');
    }
  }

  private ensureAdapterMonitoring(): Promise<void> {
    if (!environment.deployment.directAccess) return Promise.resolve();
    if (this.adapterMonitoring) return this.adapterMonitoring;
    const update = (enabled: boolean) => {
      this.adapterEnabled.next(enabled);

      if (!enabled) {
        this.clearNearby();
        void this.disconnectAll().catch(() => undefined);
      }
    };

    const monitoring = BleClient.initialize({ androidNeverForLocation: true })
      .then(async () => {
        if (!this.adapterNotificationsActive) {
          await BleClient.startEnabledNotifications(update);
          this.adapterNotificationsActive = true;
        }
        update(await BleClient.isEnabled());
      })
      .catch(() => {
        this.adapterEnabled.next(null); this.presence?.abort.abort(); this.clearNearby();
        // A new visible lifetime may retry after permission has been granted.
        // Do not retry periodically or duplicate an already-installed listener
        // when only the subsequent isEnabled snapshot failed.
        if (this.adapterMonitoring === monitoring) this.adapterMonitoring = undefined;
      });
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
    acquireConnection = false,
    fresh?: { session: BleDirectSession; check(): void },
  ): Promise<void> {
    const check = () => { this.assertAccount(context); fresh?.check(); };
    check();
    await this.savePresenceBundle(bundle, context);
    check();
    if (bundle.current.deviceConfirmed) return;
    const expectedVersion = bundle.previous?.version ?? 0;
    if (bundle.current.version !== expectedVersion + 1
      || (expectedVersion !== 0 && !bundle.previous)) {
      throw new Error('BLE_PRESENCE_PENDING_STATE_INVALID');
    }
    // Explicit rotation retains the save -> connect -> install sequence.
    if (acquireConnection && !this.isGatewayChild(bundle.logicalDeviceId)) {
      await this.ensureReady(bundle.logicalDeviceId, 15_000, context);
      check();
    }

    // Automatic maintenance may join an existing opening, but must never
    // reconnect after its page leaves. Keep pending keys for the next owner.
    const opening = this.opening;

    if (!fresh && opening?.logicalDeviceId === bundle.logicalDeviceId
      && !opening.abort.signal.aborted
      && sameAccountContext(opening.context, context)) await opening.promise;
    check();

    const active = this.active;

    const session = fresh?.session ?? active?.session;
    if (!session || session.state !== 'ready' || (!fresh && (!active
      || active.logicalDeviceId !== bundle.logicalDeviceId || !sameAccountContext(active.context, context)))) {
      throw new Error('BLE_DIRECT_SESSION_NOT_READY');
    }
    if (!fresh) { active?.admission?.signal.throwIfAborted(); active?.admission?.assertActive(); }
    check();
    const install = async () => {
      const receipt = await session.replacePresenceKey(bundle.current.accessEpoch, expectedVersion,
        bundle.current.version, bundle.current.key);
      try {
        check();
        const confirmed = await api.confirm(bundle.logicalDeviceId, receipt.encoded);
        try {
          check();
          await this.savePresenceBundle(confirmed, context);
          check();
        } finally {
          clearBlePresenceKeyBundleSecrets(confirmed);
        }
      } finally {
        receipt.keyDigest.fill(0);
        receipt.proof.fill(0);
      }
    };
    if (fresh) await install();
    else await this.useOrdinaryDirect(bundle.logicalDeviceId, context, install);
  }

  private isGatewayChild(logicalDeviceId: string): boolean {
    return isGatewayRoutedDevice(this.data.getDevice(logicalDeviceId));
  }

  private async savePresenceBundle(
    bundle: Awaited<ReturnType<HttpBlePresenceKeyApi['reveal']>>,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    const store = this.credentialStore(context), credential = await store.load(bundle.logicalDeviceId);
    try {
      this.assertAccount(context);
      const keys = [
        {
          state: 'current' as const,
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
      ];
      if (!credential?.rootCredentialRef) return await store.replacePresenceKeys(bundle.logicalDeviceId, keys);
      if (bundle.current.deviceConfirmed) return await store.replaceRegistrationPresenceKeys(bundle.logicalDeviceId,
        keys.filter(key => key.state === 'current' || bundle.previous?.deviceConfirmed));
      // Keep the writer's unresolved install material for explicit recovery,
      // but never publish it as alias nearby evidence or a confirmed root key.
      await store.saveRegistrationPresenceCandidate(bundle.logicalDeviceId, keys[0]);
    } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
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
    let credential: BleControllerCredential | undefined;

    try {
      credential = await this.credentialStore(context).load(logicalDeviceId);

      if (!credential || credential.state !== 'active') {
        throw new Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
      }

      if (credential.rootCredentialRef && !credential.presenceKeys?.length && !credential.presenceWriteCandidate) {
        clearBleControllerCredentialSecrets(credential); credential = undefined;
        const binding = await this.readRegistrationPresence(logicalDeviceId, context, signal);
        signal.throwIfAborted(); admission?.assertAcquire();
        credential = await this.credentialStore(context).load(logicalDeviceId); this.assertAccount(context);
        if (!credential || credential.state !== 'active') throw Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
        if (!binding.keys.length && !binding.canWritePresence) throw Error('ACCESS_REGISTRATION_PRESENCE_SETUP_REQUIRED');
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
        }, environment.deviceV2BleBootstrapPriorityEnabled));
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
      if (credential) clearBleControllerCredentialSecrets(credential);
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
      this.setConnection(active.logicalDeviceId, this.nearbySnapshot(active.logicalDeviceId) ? 'nearby' : 'stopped');
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
      state = { subject: new BehaviorSubject<DeviceV2BleConnectionState>('idle'),
        nearby: new BehaviorSubject<NearbyEvidence>(false), nearbyUntil: 0 };
      this.connectionStates.set(logicalDeviceId, state);
    }
    return state.subject;
  }

  private setConnection(logicalDeviceId: string, state: DeviceV2BleConnectionState): void {
    const subject = this.connectionState(logicalDeviceId);
    this.expireNearby();
    if (subject.value !== state) subject.next(state);
  }

  private markNearby(logicalDeviceId: string, observedAt = performance.now(), sourceId?: string): void {
    const until = observedAt + 15_000;
    this.expireNearby();
    if (until <= performance.now()) return;
    this.connectionState(logicalDeviceId);
    const entry = this.connectionStates.get(logicalDeviceId)!;
    entry.nearbyUntil = entry.nearbySourceId === sourceId ? Math.max(entry.nearbyUntil, until) : until;
    entry.nearbySourceId = sourceId;
    const kind = sourceId ? 'alias' : 'direct';
    if (entry.nearby.value !== kind) entry.nearby.next(kind);
    if (sourceId) this.expireNearby();
    else this.setConnection(logicalDeviceId, 'nearby');
  }

  private expireNearby(): void {
    clearTimeout(this.nearbyTimer); this.nearbyTimer = undefined;
    const now = performance.now(); let next = Infinity;
    for (const entry of this.connectionStates.values()) {
      if (!entry.nearbyUntil) continue;
      if (entry.nearbyUntil <= now) {
        entry.nearbyUntil = 0;
        entry.nearbySourceId = undefined;
        if (entry.nearby.value) entry.nearby.next(false);
        if (entry.subject.value === 'nearby') entry.subject.next('stopped');
      } else next = Math.min(next, entry.nearbyUntil);
    }
    if (next !== Infinity) this.nearbyTimer = setTimeout(() => this.expireNearby(), Math.ceil(next - now));
  }

  private clearNearby(logicalDeviceIds: Iterable<string> = this.connectionStates.keys()): void {
    for (const id of logicalDeviceIds) {
      const entry = this.connectionStates.get(id);
      if (!entry) continue;
      entry.nearbyUntil = 0;
      entry.nearbySourceId = undefined;
      if (entry.nearby.value) entry.nearby.next(false);
      if (entry.subject.value === 'nearby') entry.subject.next('stopped');
    }
    this.expireNearby();
  }

  private *aliasTargets(sourceId: string): Iterable<string> {
    for (const [id, entry] of this.connectionStates) if (entry.nearbySourceId === sourceId) yield id;
  }

  private isOwnedNearbyCard(id: string, cloudEnabled: boolean): boolean {
    const device = this.data.getDevice?.(id);
    return device?.cloudEnabled === cloudEnabled && device.config?.isShared === false
      && !device.config.disabled && !device.config.isPreview && device.deviceType !== 'edge-hub'
      && !isGatewayRoutedDevice(device);
  }

  private canProjectNearbyAlias(sourceId: string, targetId: string): boolean {
    return sourceId !== targetId && this.isOwnedNearbyCard(sourceId, false) && this.isOwnedNearbyCard(targetId, true);
  }

  private async nearbyAliasSources(targets: readonly string[], candidates: ReadonlyMap<string, AuthorizedBlePresenceCandidate[]>,
    store: CapacitorBleControllerCredentialStore, signal: AbortSignal, context: DeviceV2AccountContext,
  ): Promise<ReadonlyMap<AuthorizedBlePresenceCandidate, string | null>> {
    const aliases = new Map<AuthorizedBlePresenceCandidate, string | null>();
    for (const target of targets) {
      if (signal.aborted) break;
      if (!candidates.size) { this.clearNearby([target]); continue; }
      const evidence = await store.readBc5NearbySource(target).catch(() => undefined);
      try {
        this.assertAccount(context);
        if (signal.aborted) break;
        const ref = evidence?.reference;
        const source = ref && evidence && ref.targetLogicalDeviceId === target
          && this.canProjectNearbyAlias(ref.sourceLogicalDeviceId, target)
          && candidates.get(ref.sourceLogicalDeviceId)?.find(candidate => {
            const binding = candidate.registrationBinding;
            return candidate.accessEpoch === ref.accessEpoch && candidate.version === ref.presenceVersion
              && sameBytes(candidate.deviceInstanceId, evidence.deviceInstanceId) && sameBytes(candidate.key, evidence.key)
              && (!binding || binding.rootBindingId === ref.rootBindingId && binding.bindingRevision === ref.bindingRevision
                && binding.materialOwnerLogicalDeviceId === ref.sourceLogicalDeviceId);
          });
        if (!source) { this.clearNearby([target]); continue; }
        // One source/one Cloud target. Conflicting aliases cannot mark either.
        if (aliases.has(source)) {
          const prior = aliases.get(source);
          this.clearNearby(prior ? [target, prior] : [target]);
          aliases.set(source, null);
        } else aliases.set(source, target);
      } finally { evidence?.deviceInstanceId.fill(0); evidence?.key.fill(0); }
    }
    return aliases;
  }

  private async scanPresence(
    logicalDeviceIds: readonly string[],
    signal: AbortSignal,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    const authorized: AuthorizedBlePresenceCandidate[] = [];
    const scanning = new Set<string>();
    const aliasTargets: string[] = [];
    const ownedSources = new Map<string, AuthorizedBlePresenceCandidate[]>();
    const store = this.credentialStore(context);
    let matching: Promise<void> = Promise.resolve();
    let matchError: unknown;
    let finished = false;
    try {
      for (const logicalDeviceId of logicalDeviceIds) {
        if (signal.aborted) return;
        if (this.connectionState(logicalDeviceId).value === 'ready') continue;
        if (this.connectionState(logicalDeviceId).value !== 'nearby') this.setConnection(logicalDeviceId, 'idle');
        const credential = await store.load(logicalDeviceId).catch(() => undefined);
        try {
          this.assertAccount(context);
          if (signal.aborted) return;
          if (!credential) {
            const aliasEligible = this.isOwnedNearbyCard(logicalDeviceId, true);
            if (!aliasEligible || this.connectionStates.get(logicalDeviceId)?.nearby.value === 'direct')
              this.clearNearby([logicalDeviceId]);
            this.setConnection(logicalDeviceId, 'idle');
            if (aliasEligible) aliasTargets.push(logicalDeviceId);
            continue;
          }
          // A Direct record (even pending) supersedes nearby-only evidence.
          if (this.connectionStates.get(logicalDeviceId)?.nearbySourceId) this.clearNearby([logicalDeviceId]);
          if (credential.state !== 'active') { this.clearNearby([logicalDeviceId]); continue; }
          const presenceKeys = credential.presenceKeys ?? [];
          for (const presence of presenceKeys) {
            const candidate: AuthorizedBlePresenceCandidate = {
              logicalDeviceId,
              deviceInstanceId: credential.deviceInstanceId.slice(),
              accessEpoch: presence.accessEpoch,
              version: presence.version,
              key: presence.key.slice(),
              ...(credential.presenceBinding ? { registrationBinding: { ...credential.presenceBinding } } : {}),
            };
            authorized.push(candidate);
            if (presence.state === 'current' && this.isOwnedNearbyCard(logicalDeviceId, false)) {
              const keys = ownedSources.get(logicalDeviceId) ?? [];
              keys.push(candidate);
              ownedSources.set(logicalDeviceId, keys);
            }
          }
          if (!presenceKeys.length) { this.clearNearby([logicalDeviceId]); continue; }
          this.setConnection(logicalDeviceId, 'scanning');
          scanning.add(logicalDeviceId);
        } finally {
          if (credential) clearBleControllerCredentialSecrets(credential);
        }
      }
      const aliases = await this.nearbyAliasSources(aliasTargets, ownedSources, store, signal, context);
      if (!authorized.length || signal.aborted) return;
      // Transport deduplicates and caps observations at 64. Verify in one
      // serialized chain; no concurrent HMAC jobs or unbounded native queue.
      await discoverBlinkerDevices(BleApplicationMode.Direct, 2_500, signal, target => {
        // Time belongs to the observation, not the end of the serial HMAC queue.
        const observedAt = performance.now();
        matching = matching.then(async () => {
          if (finished || signal.aborted || matchError) return;
          this.assertAccount(context);
          const matches = await matchAuthorizedBlePresenceCandidates(target.profile, authorized);
          this.assertAccount(context);
          if (finished || signal.aborted) return;
          for (const id of new Set(matches.map(match => match.logicalDeviceId))) this.markNearby(id, observedAt);
          // Project only the exact source candidate that matched. No second
          // HMAC, no alias candidate in the Direct connection matcher.
          for (const match of matches) {
            const alias = aliases.get(match);
            if (signal.aborted || !this.isCurrentAccount(context)) return;
            if (alias && this.canProjectNearbyAlias(match.logicalDeviceId, alias)) this.markNearby(alias, observedAt, match.logicalDeviceId);
          }
        }).catch(error => { matchError ??= error; });
      });
      await matching;
      this.assertAccount(context);
      if (matchError) throw matchError;
    } catch (error) {
      if (this.isCurrentAccount(context) && error instanceof Error
        && ['BLE_SCAN_PERMISSION', 'BLE_SCAN_UNAVAILABLE'].includes(error.message)) {
        this.clearNearby(logicalDeviceIds);
      }
      throw error;
    } finally {
      finished = true;
      // An in-flight verifier still reads these secrets after its await.
      // Drain it before zeroing; cancellation fences its publication.
      await matching;
      for (const presence of authorized) {
        presence.deviceInstanceId.fill(0);
        presence.key.fill(0);
      }
      for (const logicalDeviceId of scanning) {
        if (this.isCurrentAccount(context)
          && this.connectionState(logicalDeviceId).value === 'scanning') {
          const entry = this.connectionStates.get(logicalDeviceId)!;
          if (entry.nearbyUntil > performance.now()) entry.subject.next('nearby');
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
