import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  BleApplicationMode,
  BleDirectClient,
  BleDirectEnrollmentOptions,
  BleDirectEnrollmentResult,
  BleDirectSession,
  BleDirectTarget,
  CapacitorBleControllerCredentialStore,
  CapacitorBleDirectRecordLink,
  HttpBleEnrollmentApi,
  discoverBlinkerDevice,
  discoverBlinkerDevices,
} from '../device-v2/ble-direct';
import { DeviceV2AccountState } from '../device-v2/account-client';
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

export type DeviceV2BleConnectionState = DeviceV2AccountState | 'nearby';

@Injectable({ providedIn: 'root' })
export class DeviceV2BleService {
  private readonly credentials = new CapacitorBleControllerCredentialStore();
  private readonly api: HttpBleEnrollmentApi;
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
    promise: Promise<void>;
    abort: AbortController;
  };

  constructor(
    http: HttpClient,
    private readonly manifestCache: DeviceV2ManifestCache,
  ) {
    this.api = new HttpBleEnrollmentApi(http);
  }

  discoverProvisioning(timeoutMs?: number): Promise<BleDirectTarget> {
    return discoverBlinkerDevice(BleApplicationMode.Provisioning, timeoutMs);
  }

  discoverDirect(
    timeoutMs?: number,
    excludedDeviceIds?: ReadonlySet<string>,
    signal?: AbortSignal,
  ): Promise<BleDirectTarget> {
    return discoverBlinkerDevice(
      BleApplicationMode.Direct, timeoutMs, excludedDeviceIds, signal,
    );
  }

  async enroll(
    target: BleDirectTarget,
    options: BleDirectEnrollmentOptions,
  ): Promise<BleDirectEnrollmentResult> {
    const result = await this.client().enroll(target, options);
    const manifest = result.session.store.snapshot(result.logicalDeviceId).manifest;
    if (manifest) this.manifestCache.save(result.logicalDeviceId, manifest);
    return result;
  }

  connect(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectSession> {
    return this.client().connect(logicalDeviceId, target);
  }

  watchConnection(logicalDeviceId: string): Observable<DeviceV2BleConnectionState> {
    return this.connectionState(logicalDeviceId).asObservable();
  }

  refreshPresence(logicalDeviceIds: readonly string[]): Promise<void> {
    if (this.active || this.opening) return Promise.resolve();
    if (this.presence) return this.presence.promise;
    const ids = [...new Set(logicalDeviceIds.filter(
      id => /^ble_[A-Za-z0-9_-]{22}$/.test(id),
    ))];
    if (!ids.length) return Promise.resolve();
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
    this.presence = { promise, abort };
    return promise;
  }

  ensureReady(logicalDeviceId: string): Promise<void> {
    if (this.active?.logicalDeviceId === logicalDeviceId
      && this.active.session.state === 'ready') {
      return this.active.session.synchronize();
    }
    if (this.opening?.logicalDeviceId === logicalDeviceId) return this.opening.promise;

    const presence = this.presence;
    if (presence) {
      presence.abort.abort();
      return presence.promise.catch(() => undefined).then(
        () => this.ensureReady(logicalDeviceId),
      );
    }

    const generation = ++this.generation;
    const abort = new AbortController();
    const promise = this.open(logicalDeviceId, generation, abort.signal).finally(() => {
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

  resumeEnrollment(
    logicalDeviceId: string,
    target: BleDirectTarget,
  ): Promise<BleDirectEnrollmentResult> {
    return this.client().resume(logicalDeviceId, target);
  }

  private client(): BleDirectClient {
    return new BleDirectClient(
      new CapacitorBleDirectRecordLink(), this.api, this.credentials,
    );
  }

  private async open(
    logicalDeviceId: string,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    await this.closeActive();
    if (generation !== this.generation) return;
    this.setConnection(logicalDeviceId, 'connecting');
    let session: BleDirectSession | undefined;
    try {
      const deadline = Date.now() + 15_000;
      const rejected = new Set<string>();
      while (!session) {
        const remaining = deadline - Date.now();
        if (remaining < 1) throw new Error('BLE_DIRECT_SCAN_TIMEOUT');
        const target = await this.discoverDirect(remaining, rejected, signal);
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
    const byTransportId = new Map<string, string[]>();
    for (const logicalDeviceId of logicalDeviceIds) {
      if (this.connectionState(logicalDeviceId).value === 'ready') continue;
      this.setConnection(logicalDeviceId, 'idle');
      const credential = await this.credentials.load(logicalDeviceId).catch(() => undefined);
      if (!credential) continue;
      try {
        const transportDeviceId = credential.transportDeviceId?.toLowerCase();
        if (!transportDeviceId) continue;
        const ids = byTransportId.get(transportDeviceId) ?? [];
        ids.push(logicalDeviceId);
        byTransportId.set(transportDeviceId, ids);
      } finally {
        credential.controllerSecret.fill(0);
      }
    }
    if (!byTransportId.size || signal.aborted) return;
    const targets = await discoverBlinkerDevices(BleApplicationMode.Direct, 2_500, signal);
    if (signal.aborted) return;
    for (const target of targets) {
      for (const logicalDeviceId of byTransportId.get(
        target.device.deviceId.toLowerCase(),
      ) ?? []) {
        this.setConnection(logicalDeviceId, 'nearby');
      }
    }
  }
}
