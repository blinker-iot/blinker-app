import { Injectable, NgZone } from '@angular/core';
import { isGatewayRoutedDevice } from './device-routing';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2Event,
  DeviceV2ManifestField,
  DeviceV2TargetSnapshot,
  DeviceV2TelemetryLease,
  DeviceV2TelemetrySnapshot,
  DeviceV2Value,
  DeviceV2ValueType,
  isDeviceV2TargetReady,
} from '../protocol/device-v2';
import {
  DeviceV2AccountState,
  DeviceV2Service,
} from '../services/device-v2.service';
import {
  DeviceV2BleConnectionState,
  DeviceV2BleService,
} from '../services/device-v2-ble.service';
import { AppVisibilityService } from '../services/app-visibility.service';
import { DeviceV2ManifestCache } from '../services/device-v2-manifest-cache.service';
import { DataService } from '../services/data.service';
import { NetworkService } from '../services/network.service';
import { DeviceV2LanService } from '../services/device-v2-lan.service';
import { DirectDeviceSession } from '../protocol/device-v2/direct-session';
import { BleOfflineOpportunity } from './ble-direct/offline-opportunity';
import { DeviceUiConnection, DeviceUiConnectionScope } from './connection-scope';
export type { DeviceUiConnection } from './connection-scope';

export type DeviceUiConnectionState = DeviceV2BleConnectionState;
export type DeviceUiTransport = 'cloud' | 'ble' | 'lan';
export type DeviceUiEndpointRole = 'property' | 'action' | 'event';
export type DeviceUiValueType =
  | 'boolean'
  | 'integer'
  | 'number'
  | 'text'
  | 'bytes'
  | 'object'
  | 'array'
  | 'null';
export type DeviceUiValue = boolean | number | bigint | string | null | Uint8Array;

interface ConnectionGroup {
  scopes: Set<DeviceUiConnectionScope>;
  disconnectOnIdle: boolean;
  // Explicitly offline callers share one bounded physical Direct opportunity.
  direct?: DeviceUiConnectionScope;
  lan?: { controller: AbortController; ready: Promise<void>; session?: DirectDeviceSession; permissions?: 1 | 3 };
}

export interface DeviceUiEndpoint {
  id: number;
  key: string;
  role: DeviceUiEndpointRole;
  valueType: DeviceUiValueType;
  readable: boolean;
  writable: boolean;
  notifies: boolean;
  value?: DeviceUiValue;
  minimum?: number;
  maximum?: number;
  step?: number;
  maxLength?: number;
  unit?: string;
  choices?: string[];
  telemetryMinimumIntervalMs?: number;
}

export interface DeviceUiSnapshot {
  manifestRevision: number | null;
  manifestFingerprint: string | null;
  manifestAccepted: boolean;
  stateRevision: number | null;
  stateFresh: boolean;
  endpoints: DeviceUiEndpoint[];
}

export interface DeviceUiEvent {
  logicalDeviceId: string;
  values: Readonly<Record<string, DeviceUiValue | undefined>>;
}

export interface DeviceUiTelemetrySnapshot {
  active: boolean;
  effectiveIntervalMs: number;
  values: Readonly<Record<string, DeviceUiValue | undefined>>;
}

export interface DeviceUiConnectivitySnapshot {
  activeTransport: DeviceUiTransport;
  directConnectAllowed: boolean;
  bleAccess: boolean | null;
  bleAdapterEnabled: boolean | null;
  bleState: DeviceV2BleConnectionState;
  cloudSessionState: DeviceV2AccountState;
}

const HYBRID_BLE_CONNECT_TIMEOUT_MS = 5_000;
const WIFI_PROV_DIRECT_HANDOFF_TIMEOUT_MS = 15_000;

export interface DeviceUiTelemetryLease {
  readonly snapshot: DeviceUiTelemetrySnapshot;
  subscribe(listener: (snapshot: DeviceUiTelemetrySnapshot) => void): () => void;
  setVisible(visible: boolean): Promise<void>;
  close(): Promise<void>;
}

function cloneUiValue(value: DeviceV2Value['value']): DeviceUiValue | undefined {
  return value instanceof Uint8Array ? new Uint8Array(value) : value;
}

function mapTelemetrySnapshot(snapshot: DeviceV2TelemetrySnapshot): DeviceUiTelemetrySnapshot {
  return {
    active: snapshot.active,
    effectiveIntervalMs: snapshot.effectiveIntervalMs,
    values: Object.fromEntries(Object.entries(snapshot.values).map(
      ([key, value]) => [key, cloneUiValue(value.value)],
    )),
  };
}

class DeviceUiTelemetryLeaseAdapter implements DeviceUiTelemetryLease {
  constructor(
    private readonly lease: DeviceV2TelemetryLease,
    private readonly zone: NgZone,
  ) {}

  get snapshot(): DeviceUiTelemetrySnapshot {
    return mapTelemetrySnapshot(this.lease.snapshot);
  }

  subscribe(listener: (snapshot: DeviceUiTelemetrySnapshot) => void): () => void {
    return this.lease.subscribe(snapshot => {
      this.zone.run(() => listener(mapTelemetrySnapshot(snapshot)));
    });
  }

  setVisible(visible: boolean): Promise<void> {
    return this.lease.setVisible(visible);
  }

  close(): Promise<void> {
    return this.lease.close();
  }
}

@Injectable({ providedIn: 'root' })
export class DeviceUiPort {
  readonly appActive: Observable<boolean>;
  private readonly transports = new Map<string, BehaviorSubject<DeviceUiTransport>>();
  private readonly directHandoffs = new Map<string, Promise<void>>();
  private readonly connections = new Map<string, ConnectionGroup>();
  private readonly offlineOpportunity = new BleOfflineOpportunity();
  private readonly lanChanges = new Subject<string>();
  private active = true;

  constructor(
    private readonly deviceV2: DeviceV2Service,
    private readonly ble: DeviceV2BleService,
    private readonly zone: NgZone,
    appVisibility: AppVisibilityService,
    private readonly data: DataService,
    private readonly manifestCache?: DeviceV2ManifestCache,
    private readonly network?: NetworkService,
    private readonly lan?: DeviceV2LanService,
  ) {
    this.appActive = appVisibility.active.asObservable();
    appVisibility.active.subscribe(active => {
      this.active = active;
      if (!active) for (const group of this.connections.values()) {
        for (const scope of group.scopes) scope.close();
      }
    });
    let accountEpoch = data.sessionEpoch;
    data.authDataChanged?.subscribe(() => {
      if (accountEpoch === data.sessionEpoch) return;
      accountEpoch = data.sessionEpoch;
      for (const group of this.connections.values()) for (const scope of group.scopes) scope.close();
    });
    data.deviceDataLoader?.subscribe(loaded => {
      if (!loaded) return;
      for (const [id, group] of this.connections) {
        const device = data.getDevice(id);
        if (!device || device.config?.disabled) {
          for (const scope of group.scopes) scope.close(Error('DEVICE_V2_DEVICE_UNAVAILABLE'));
        }
      }
    });
  }

  // One-shot read-only synchronization. A page uses openConnection instead,
  // retaining the same owner after ready until it leaves or is backgrounded.
  async connect(logicalDeviceId: string, signal?: AbortSignal): Promise<void> {
    const scope = this.createConnection(logicalDeviceId, false, signal);
    try { await scope.ready; } finally { scope.close(); }
  }

  openConnection(logicalDeviceId: string, signal?: AbortSignal): DeviceUiConnection {
    return this.createConnection(logicalDeviceId, true, signal);
  }

  private createConnection(logicalDeviceId: string, persistent: boolean, signal?: AbortSignal): DeviceUiConnectionScope {
    let group = this.connections.get(logicalDeviceId);
    if (group && [...group.scopes].every(scope => scope.signal.aborted)) {
      group.direct?.close();
      group.lan?.controller.abort();
      this.connections.delete(logicalDeviceId);
      group = undefined;
    }
    if (!group) this.connections.set(logicalDeviceId, group = { scopes: new Set(), disconnectOnIdle: false });
    const scope = new DeviceUiConnectionScope(current => this.connectTarget(logicalDeviceId, current, group, persistent), signal);
    // Latch local cleanup ownership before a directory removal can erase the
    // target's role. A Cloud caller must not close an unrelated native session.
    group.disconnectOnIdle ||= persistent && this.supportsDirectBle(logicalDeviceId)
      && !this.isGatewayChild(logicalDeviceId);
    group.scopes.add(scope);
    void scope.closed.then(() => {
      group.scopes.delete(scope);
      if (!group.scopes.size && this.connections.get(logicalDeviceId) === group) {
        this.connections.delete(logicalDeviceId);
        if (group.lan) {
          group.lan.controller.abort();
          this.lanChanges.next(logicalDeviceId);
          if (this.transport(logicalDeviceId).value === 'lan') this.selectTransport(logicalDeviceId, 'cloud');
        }
        if (group.direct) {
          group.direct.close(); // Its signal closes only its own native link, never a successor by logical id.
          this.selectTransport(logicalDeviceId, 'cloud');
        } else if (group.disconnectOnIdle) void this.ble.disconnect(logicalDeviceId).catch(() => undefined);
      }
    });
    if (!this.active) scope.close();
    return scope;
  }

  private async connectCloud(logicalDeviceId: string, scope: DeviceUiConnectionScope, persistent: boolean): Promise<void> {
    if (persistent) {
      const interest = await this.deviceV2.acquireStateInterest(logicalDeviceId, scope.signal);
      // Losing Cloud observation must not tear down an already-ready LAN link.
      // The Session marks cloud values stale; a new explicit page may reacquire.
      if (interest) await scope.hold(interest, false);
    }
    // Only gateway children need a southbound connection. Ordinary WiFi and
    // the Hub itself are not BLE wake targets; Presence/list reads stay passive.
    if (this.isGatewayChild(logicalDeviceId)) {
      await scope.hold(await this.deviceV2.acquireConnectionDemand(logicalDeviceId, scope.signal));
    }
    await this.deviceV2.waitUntilReady(logicalDeviceId, scope.signal);
  }

  private async connectTarget(logicalDeviceId: string, scope: DeviceUiConnectionScope, group: ConnectionGroup, persistent: boolean): Promise<void> {
    const signal = scope.signal;
    signal.throwIfAborted();
    if (group.lan || (persistent && this.lan?.available(logicalDeviceId))) {
      // One page group, two already-existing carriers. Cloud starts NOW and
      // remains usable while LAN prepares; neither path waits for the other.
      if (!group.lan) this.prepareLan(logicalDeviceId, group);
      if (!this.lanSession(logicalDeviceId)) this.selectTransport(logicalDeviceId, 'cloud');
      await Promise.any([this.connectCloud(logicalDeviceId, scope, persistent), group.lan!.ready.then(() => {
        signal.throwIfAborted();
        if (!this.lanSession(logicalDeviceId)) throw new Error('LOCAL_ACCESS_SCOPE_CLOSED');
      })]);
      signal.throwIfAborted();
      return;
    }
    if (!this.supportsDirectBle(logicalDeviceId)) {
      // A stored Direct credential is historical local evidence, not a
      // product capability. Edge Hubs are BLE centrals, never Direct
      // peripherals, so a stale credential must not delay Cloud with a scan.
      this.selectTransport(logicalDeviceId, 'cloud');
      await this.connectCloud(logicalDeviceId, scope, persistent);
      return;
    }
    if (!this.isCloudCapable(logicalDeviceId)) {
      void this.syncManagedPresence(logicalDeviceId);
      this.selectTransport(logicalDeviceId, 'ble');
      await this.ble.ensureReady(logicalDeviceId);
      return;
    }

    if (this.isGatewayChild(logicalDeviceId)) {
      await this.connectGatewayChild(logicalDeviceId, scope, group, persistent);
      return;
    }

    // WiFiProv and Direct use different native BLE owners. During the exact
    // handoff window, keep Cloud usable while one long-lived Direct scan waits
    // for the peripheral to replace its provisioning advertisement. Starting
    // the ordinary 5 s page scan in parallel would only churn Android GATT.
    if (this.directHandoffs.has(logicalDeviceId)) {
      this.selectTransport(logicalDeviceId, 'cloud');
      await this.connectCloud(logicalDeviceId, scope, persistent);
      return;
    }

    if (!persistent) {
      // One-shot readers have no page lifetime to retain a late candidate.
      if (await this.prepareDirectCandidate(logicalDeviceId, scope)) return;
      this.selectTransport(logicalDeviceId, 'cloud');
      await this.connectCloud(logicalDeviceId, scope, persistent);
      return;
    }

    // Reuse the account MQTT and this page's interest. Neither a credential
    // lookup nor an unsuccessful BLE scan may hold an available Cloud path.
    // Keep an existing ready Direct path while a second scope synchronizes.
    if (!this.isBleDirect(logicalDeviceId) || this.ble.connectionSnapshot(logicalDeviceId) !== 'ready') {
      this.selectTransport(logicalDeviceId, 'cloud');
    }
    const cloud = this.connectCloud(logicalDeviceId, scope, persistent);
    const direct = this.prepareDirectCandidate(logicalDeviceId, scope)
      .then(ready => ready ? undefined : cloud);
    // Preserve the original Cloud error if neither path succeeds; no new
    // AggregateError contract leaks to the page. Both late results are owned.
    await Promise.any([cloud, direct]).catch(() => cloud);
    signal.throwIfAborted();
  }

  private async prepareDirectCandidate(logicalDeviceId: string, scope: DeviceUiConnectionScope): Promise<boolean> {
    const signal = scope.signal;
    const hasDirectAccess = await this.ble.hasActiveCredential(logicalDeviceId)
      .catch(() => false);
    signal.throwIfAborted();
    if (hasDirectAccess) {
      void this.syncManagedPresence(logicalDeviceId);
      try {
        // A background presence scan is only a discovery optimization.
        // ensureReady cancels it and proves the selected logical device with
        // Method 2, so an ambiguous/stale transport address cannot force Cloud.
        await this.ble.ensureReady(logicalDeviceId, HYBRID_BLE_CONNECT_TIMEOUT_MS);
        signal.throwIfAborted();
        // A credential/scan is only a candidate. Do not replace a usable
        // Cloud snapshot until this scope has proved Direct readiness.
        this.selectTransport(logicalDeviceId, 'ble');
        return true;
      } catch {
        signal.throwIfAborted();
        // A failed candidate cannot replace the usable path or resend a command.
      }
    }
    return false;
  }

  private prepareLan(id: string, group: ConnectionGroup): void {
    const entry: NonNullable<ConnectionGroup['lan']> = { controller: new AbortController(), ready: Promise.resolve() };
    group.lan = entry;
    const retire = () => {
      entry.controller.abort();
      this.lanChanges.next(id);
      if (this.connections.get(id) === group && this.transport(id).value === 'lan') this.selectTransport(id, 'cloud');
    };
    entry.ready = Promise.resolve().then(() => this.lan!.open(id, entry.controller.signal)).then(async ({ session, permissions }) => {
      if (entry.controller.signal.aborted || this.connections.get(id) !== group
        || ![...group.scopes].some(scope => !scope.signal.aborted)) {
        await session.close(); throw new Error('LOCAL_ACCESS_SCOPE_CLOSED');
      }
      entry.session = session;
      entry.permissions = permissions;
      session.subscribeErrors(retire);
      session.subscribeClosed(retire);
      if (session.state !== 'ready') throw new Error('LOCAL_ACCESS_SCOPE_CLOSED');
      let fingerprint: string | undefined;
      const cache = (changedId: string, snapshot: DeviceV2TargetSnapshot) => {
        if (changedId !== id || entry.controller.signal.aborted || this.connections.get(id) !== group
          || !snapshot.manifestAccepted || !snapshot.manifest || snapshot.manifest.fingerprint === fingerprint) return;
        fingerprint = snapshot.manifest.fingerprint;
        this.manifestCache?.save(id, snapshot.manifest);
      };
      cache(id, session.store.snapshot(id));
      const detachCache = session.store.subscribe(cache);
      entry.controller.signal.addEventListener('abort', detachCache, { once: true });
      this.lanChanges.next(id);
      this.selectTransport(id, 'lan');
    }).catch(error => { retire(); throw error; });
    // Failure only removes the candidate. Never replay an in-flight command
    // or create another MQTT/native session from this background completion.
    void entry.ready.catch(() => undefined);
  }

  private lanSession(id: string): DirectDeviceSession | undefined {
    const group = this.connections.get(id), entry = group?.lan;
    return entry && !entry.controller.signal.aborted && entry.session?.state === 'ready'
      && [...group.scopes].some(scope => !scope.signal.aborted) ? entry.session : undefined;
  }

  private async connectGatewayChild(id: string, caller: DeviceUiConnectionScope, group: ConnectionGroup, persistent: boolean): Promise<void> {
    // Ordinary pages share the account MQTT route through the gateway. Local
    // credentials/nearby advertisements must not cause a southbound takeover.
    // Only explicit native offline evidence selects the bounded Direct path;
    // a Cloud timeout/denial is never authority to fall through to it.
    if (!this.network?.offline) {
      this.selectTransport(id, 'cloud');
      await this.connectCloud(id, caller, persistent);
      return;
    }
    const hasCredential = await this.ble.hasActiveCredential(id).catch(() => false);
    caller.signal.throwIfAborted();
    if (!this.network.offline) throw Error('BLE_DIRECT_OFFLINE_EVIDENCE_LOST');
    if (!hasCredential) throw Error('BLE_DIRECT_CREDENTIAL_NOT_FOUND');
    if (!group.direct) {
      const direct = new DeviceUiConnectionScope(async scope => {
        const changed = this.network.connected.subscribe(connected => {
          if (connected !== false) scope.close(Error('BLE_DIRECT_OFFLINE_EVIDENCE_LOST'));
        });
        void scope.closed.then(() => changed.unsubscribe());
        await this.offlineOpportunity.connect(scope.signal,
          () => { if (!this.network.offline) throw Error('BLE_DIRECT_OFFLINE_EVIDENCE_LOST'); },
          reason => scope.close(reason),
          admission => this.ble.ensureReady(id, BleOfflineOpportunity.acquisitionMillis, undefined, admission),
          admission => this.ble.disconnect(id, admission));
      });
      group.direct = direct;
      void direct.closed.then(() => {
        if (this.connections.get(id) === group) this.selectTransport(id, 'cloud');
      });
    }
    const direct = group.direct;
    await direct.ready;
    caller.signal.throwIfAborted();
    direct.signal.throwIfAborted();
    // Retirement closes this caller; it cannot replay an unknown Action via
    // Cloud or acquire a replacement path behind the user's back.
    void direct.closed.then(() => caller.close(direct.signal.reason));
    this.selectTransport(id, 'ble');
  }

  startDirectHandoff(logicalDeviceId: string): Promise<void> {
    if (!this.supportsDirectBle(logicalDeviceId)
      || this.isGatewayChild(logicalDeviceId)
      || !this.isCloudCapable(logicalDeviceId)
      || !this.directConnectAllowed(logicalDeviceId)) return Promise.resolve();
    const active = this.directHandoffs.get(logicalDeviceId);
    if (active) return active;

    this.selectTransport(logicalDeviceId, 'cloud');
    const task = this.openDirectHandoff(logicalDeviceId).finally(() => {
      if (this.directHandoffs.get(logicalDeviceId) === task) {
        this.directHandoffs.delete(logicalDeviceId);
      }
    });
    this.directHandoffs.set(logicalDeviceId, task);
    return task;
  }

  private async openDirectHandoff(logicalDeviceId: string): Promise<void> {
    const hasDirectAccess = await this.ble.hasActiveCredential(logicalDeviceId)
      .catch(() => false);
    if (!hasDirectAccess) return;
    void this.syncManagedPresence(logicalDeviceId);
    try {
      await this.ble.ensureReady(
        logicalDeviceId,
        WIFI_PROV_DIRECT_HANDOFF_TIMEOUT_MS,
      );
      this.selectTransport(logicalDeviceId, 'ble');
    } catch {
      // Cloud remains selected. The visible page owns any later retry budget.
    }
  }

  private async syncManagedPresence(logicalDeviceId: string): Promise<void> {
    if (!this.supportsDirectBle(logicalDeviceId)) return;
    const canManage = await this.ble
      .canManagePresenceCredential(logicalDeviceId)
      .catch(() => false);
    if (!canManage) return;
    // Page entry retries both the initial v2 -> v3 installation and a durable
    // server-side rotation request. The caller deliberately runs this in the
    // background: a local PresenceKey can select the peripheral immediately,
    // and an unavailable server must not delay an authenticated Direct session.
    await this.ble.syncPresenceCredential(logicalDeviceId).catch(() => undefined);
  }

  async disconnect(logicalDeviceId: string): Promise<void> {
    const local = this.connections.get(logicalDeviceId)?.lan;
    local?.controller.abort();
    for (const scope of this.connections.get(logicalDeviceId)?.scopes ?? []) scope.close();
    // Transport selection may already have fallen back to Cloud while a
    // bounded Direct scan is still open. Always delegate cancellation; the
    // BLE service is a no-op unless this logical device owns a session/open.
    await this.ble.disconnect(logicalDeviceId);
    if (local?.session) await local.session.close();
    if (this.isCloudCapable(logicalDeviceId)) {
      this.selectTransport(logicalDeviceId, 'cloud');
    }
  }

  watchConnection(logicalDeviceId: string): Observable<DeviceUiConnectionState> {
    return new Observable(subscriber => {
      let selected = this.transport(logicalDeviceId).value;
      let cloudState: DeviceUiConnectionState = this.deviceV2.state.value;
      let bleState: DeviceUiConnectionState = this.ble.connectionSnapshot(logicalDeviceId);
      let last: DeviceUiConnectionState | undefined;
      const publish = () => {
        const next = selected === 'lan' ? (this.lanSession(logicalDeviceId) ? 'ready' : 'stopped')
          : selected === 'ble' ? bleState : cloudState;
        if (next === last) return;
        last = next;
        this.zone.run(() => subscriber.next(next));
      };
      const transportSubscription = this.transport(logicalDeviceId).subscribe(value => {
        selected = value;
        publish();
      });
      const cloudSubscription = this.deviceV2.state.subscribe(value => {
        cloudState = value;
        publish();
      });
      const lanSubscription = this.lanChanges.subscribe(id => { if (id === logicalDeviceId) publish(); });
      const bleSubscription = this.ble.watchConnection(logicalDeviceId).subscribe(value => {
        bleState = value;
        if (this.isCloudCapable(logicalDeviceId)
          && this.directConnectAllowed(logicalDeviceId)
          && value === 'ready' && selected !== 'ble' && selected !== 'lan') {
          // A bounded Direct attempt may transiently report stopped before a
          // later retry completes. Once Method 2 has proved the same logical
          // device, BLE is usable and must become the hybrid foreground path
          // again; otherwise the page remains pinned to a slower/failing Cloud
          // session even though its Direct Manifest and State are already live.
          this.selectTransport(logicalDeviceId, 'ble');
          return;
        }
        if (this.isCloudCapable(logicalDeviceId) && selected === 'ble' && value === 'stopped') {
          // Direct is preferred only while it is usable. A peripheral may
          // retire an idle or faulted GATT session; keep the hybrid device
          // available through its existing cloud session without replaying
          // the command that preceded the disconnect.
          this.selectTransport(logicalDeviceId, 'cloud');
          // The visible page acquires its own Cloud scope on the connection
          // notification. A passive observer must not start a hidden sync.
          return;
        }
        publish();
      });
      return () => {
        transportSubscription.unsubscribe();
        cloudSubscription.unsubscribe();
        bleSubscription.unsubscribe();
        lanSubscription.unsubscribe();
      };
    });
  }

  watchConnectivity(logicalDeviceId: string): Observable<DeviceUiConnectivitySnapshot> {
    return new Observable(subscriber => {
      let activeTransport = this.transport(logicalDeviceId).value;
      let bleAccess: boolean | null = !this.supportsDirectBle(logicalDeviceId)
        ? false
        : this.isCloudCapable(logicalDeviceId) ? null : true;
      let bleAdapterEnabled: boolean | null = null;
      let bleState = this.ble.connectionSnapshot(logicalDeviceId);
      let cloudSessionState = this.deviceV2.state.value;
      let closed = false;
      let last = '';
      const publish = () => {
        const snapshot: DeviceUiConnectivitySnapshot = {
          activeTransport,
          directConnectAllowed: this.directConnectAllowed(logicalDeviceId),
          bleAccess,
          bleAdapterEnabled,
          bleState,
          cloudSessionState,
        };
        const key = `${activeTransport}|${String(bleAccess)}|${String(bleAdapterEnabled)}`
          + `|${bleState}|${cloudSessionState}`;
        if (key === last) return;
        last = key;
        this.zone.run(() => subscriber.next(snapshot));
      };
      const transportSubscription = this.transport(logicalDeviceId).subscribe(value => {
        activeTransport = value;
        publish();
      });
      const cloudSubscription = this.deviceV2.state.subscribe(value => {
        cloudSessionState = value;
        publish();
      });
      const bleSubscription = this.ble.watchConnection(logicalDeviceId).subscribe(value => {
        bleState = value;
        publish();
      });
      const adapterSubscription = this.supportsDirectBle(logicalDeviceId)
        ? this.ble.watchAdapterEnabled().subscribe(value => {
          bleAdapterEnabled = value;
          publish();
        })
        : undefined;
      const deviceSubscription = this.data.getDevice(logicalDeviceId)?.subject?.subscribe(() => {
        if (!this.directConnectAllowed(logicalDeviceId)) {
          this.selectTransport(logicalDeviceId, 'cloud');
        }
        publish();
      });
      if (bleAccess === null) {
        void this.ble.hasActiveCredential(logicalDeviceId)
          .then(value => {
            if (closed) return;
            bleAccess = value;
            publish();
          })
          .catch(() => {
            if (closed) return;
            bleAccess = false;
            publish();
          });
      }
      return () => {
        closed = true;
        transportSubscription.unsubscribe();
        cloudSubscription.unsubscribe();
        bleSubscription.unsubscribe();
        adapterSubscription?.unsubscribe();
        deviceSubscription?.unsubscribe();
      };
    });
  }

  async refreshBlePresence(logicalDeviceIds: readonly string[]): Promise<void> {
    const ids = [...new Set(logicalDeviceIds.filter(id => id.length > 0))];
    const directIds = ids.filter(id => this.supportsDirectBle(id));
    if (directIds.length) await this.ble.refreshPresence(directIds);
    for (const logicalDeviceId of ids) {
      if (this.lanSession(logicalDeviceId)) continue;
      if (!this.supportsDirectBle(logicalDeviceId)) {
        this.selectTransport(logicalDeviceId, 'cloud');
        continue;
      }
      if (!this.isCloudCapable(logicalDeviceId)) {
        this.selectTransport(logicalDeviceId, 'ble');
        continue;
      }
      if (!this.directConnectAllowed(logicalDeviceId)) {
        this.selectTransport(logicalDeviceId, 'cloud');
        continue;
      }
      const state = this.ble.connectionSnapshot(logicalDeviceId);
      this.selectTransport(
        logicalDeviceId,
        state === 'ready' ? 'ble' : 'cloud',
      );
    }
  }

  watchState(logicalDeviceId: string): Observable<DeviceUiSnapshot> {
    return new Observable(subscriber => {
      let selected = this.transport(logicalDeviceId).value;
      let detachLan = () => undefined;
      const publish = (snapshot: DeviceV2TargetSnapshot) => {
        const mapped = this.mapSnapshot(snapshot);
        this.zone.run(() => subscriber.next(
          mapped.manifestAccepted ? mapped : this.cachedSnapshot(logicalDeviceId) ?? mapped,
        ));
      };
      const publishSelected = () => publish(selected === 'lan'
        ? this.lanSession(logicalDeviceId)?.store.snapshot(logicalDeviceId) ?? this.deviceV2.snapshot(logicalDeviceId)
        : selected === 'ble' ? this.ble.snapshot(logicalDeviceId) : this.deviceV2.snapshot(logicalDeviceId));
      const bindLan = () => {
        detachLan();
        detachLan = this.lanSession(logicalDeviceId)?.store.subscribe((id, snapshot) => {
          if (selected === 'lan' && id === logicalDeviceId) publish(snapshot);
        }) ?? (() => undefined);
      };
      bindLan();
      const lanSubscription = this.lanChanges.subscribe(id => { if (id === logicalDeviceId) { bindLan(); publishSelected(); } });
      const transportSubscription = this.transport(logicalDeviceId).subscribe(value => {
        selected = value;
        publishSelected();
      });
      const detachCloud = this.deviceV2.store.subscribe((changedId, snapshot) => {
        if (selected === 'cloud' && changedId === logicalDeviceId) publish(snapshot);
      });
      const detachBle = this.ble.subscribe((changedId, snapshot) => {
        if (selected === 'ble' && changedId === logicalDeviceId) publish(snapshot);
      });
      return () => {
        transportSubscription.unsubscribe();
        detachCloud();
        detachBle();
        detachLan(); lanSubscription.unsubscribe();
      };
    });
  }

  watchEvents(logicalDeviceId: string): Observable<DeviceUiEvent> {
    return new Observable(subscriber => {
      let detachLan = () => undefined;
      const publish = (source: DeviceUiTransport, event: DeviceV2Event) => {
        if (this.transport(logicalDeviceId).value !== source
          || event.logicalDeviceId !== logicalDeviceId) return;
        this.zone.run(() => subscriber.next(this.mapEvent(event)));
      };
      const detachCloud = this.deviceV2.store.subscribeEvents(
        event => publish('cloud', event),
      );
      const detachBle = this.ble.subscribeEvents(event => publish('ble', event));
      const bindLan = () => {
        detachLan();
        detachLan = this.lanSession(logicalDeviceId)?.store.subscribeEvents(event => publish('lan', event)) ?? (() => undefined);
      };
      bindLan();
      const lanSubscription = this.lanChanges.subscribe(id => { if (id === logicalDeviceId) bindLan(); });
      return () => {
        detachCloud();
        detachBle();
        detachLan(); lanSubscription.unsubscribe();
      };
    });
  }

  async sendCommand(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<void> {
    if (this.transport(logicalDeviceId).value === 'lan') {
      const session = this.lanSession(logicalDeviceId);
      if (!session) throw new Error('LOCAL_ACCESS_SCOPE_REQUIRED');
      // Observe-only/endpoint-filtered sharing keeps writes on the original
      // ACL-enforcing cloud route BEFORE sending anything, not after failure.
      if (this.connections.get(logicalDeviceId)?.lan?.permissions !== 3) {
        await this.deviceV2.command(logicalDeviceId, endpointKey, value);
        return;
      }
      await session.command(endpointKey, value);
      return;
    }
    if (this.isGatewayChild(logicalDeviceId) && this.transport(logicalDeviceId).value === 'ble') {
      if (!this.connections.get(logicalDeviceId)?.direct?.isReady) throw new Error('BLE_DIRECT_SCOPE_REQUIRED');
      await this.ble.commandConnected(logicalDeviceId, endpointKey, value);
      return;
    }
    if (this.transport(logicalDeviceId).value === 'ble') {
      await this.ble.command(logicalDeviceId, endpointKey, value);
    } else {
      await this.deviceV2.command(logicalDeviceId, endpointKey, value);
    }
  }

  async openTelemetry(
    logicalDeviceId: string,
    endpointKeys: string[],
    intervalMs: number,
  ): Promise<DeviceUiTelemetryLease> {
    if (this.transport(logicalDeviceId).value === 'ble') {
      throw new Error('BLE_DIRECT_TELEMETRY_NOT_ENABLED');
    }
    const lease = await this.deviceV2.openTelemetry(logicalDeviceId, endpointKeys, intervalMs);
    return new DeviceUiTelemetryLeaseAdapter(lease, this.zone);
  }

  isBleDirect(logicalDeviceId: string): boolean {
    return this.transport(logicalDeviceId).value === 'ble';
  }

  private isCloudCapable(logicalDeviceId: string): boolean {
    return this.data.getDevice(logicalDeviceId)?.cloudEnabled === true;
  }

  private supportsDirectBle(logicalDeviceId: string): boolean {
    return this.data.getDevice(logicalDeviceId)?.deviceType !== 'edge-hub';
  }

  private directConnectAllowed(logicalDeviceId: string): boolean {
    return !this.isGatewayChild(logicalDeviceId)
      || this.connections.get(logicalDeviceId)?.direct?.isReady === true;
  }

  private isGatewayChild(logicalDeviceId: string): boolean {
    return isGatewayRoutedDevice(this.data.getDevice(logicalDeviceId));
  }

  private transport(logicalDeviceId: string): BehaviorSubject<DeviceUiTransport> {
    let transport = this.transports.get(logicalDeviceId);
    if (!transport) {
      transport = new BehaviorSubject<DeviceUiTransport>(
        this.isCloudCapable(logicalDeviceId) ? 'cloud' : 'ble',
      );
      this.transports.set(logicalDeviceId, transport);
    }
    return transport;
  }

  private selectTransport(logicalDeviceId: string, value: DeviceUiTransport): void {
    const transport = this.transport(logicalDeviceId);
    if (transport.value !== value) transport.next(value);
  }

  private mapSnapshot(snapshot: DeviceV2TargetSnapshot): DeviceUiSnapshot {
    const fields = snapshot.manifest?.fields ?? [];
    return {
      manifestRevision: snapshot.manifest?.revision ?? null,
      manifestFingerprint: snapshot.manifest?.fingerprint ?? null,
      manifestAccepted: snapshot.manifestAccepted,
      stateRevision: snapshot.stateRevision,
      stateFresh: isDeviceV2TargetReady(snapshot),
      endpoints: fields.map(field => this.mapEndpoint(field, snapshot.values[field.key])),
    };
  }

  private cachedSnapshot(logicalDeviceId: string): DeviceUiSnapshot | undefined {
    const manifest = this.manifestCache?.load(logicalDeviceId);
    return manifest ? this.mapSnapshot({
      manifest,
      manifestAccepted: true,
      stateRevision: null,
      stateFresh: false,
      values: Object.create(null),
      eventInterrupted: true,
      cloudReachable: null,
      cloudLastSeenAt: null,
    }) : undefined;
  }

  private mapEndpoint(field: DeviceV2ManifestField, value?: DeviceV2Value): DeviceUiEndpoint {
    const constraints = field.constraints;
    return {
      id: field.id,
      key: field.key,
      role: this.mapRole(field.kind),
      valueType: this.mapValueType(field.type),
      readable: (field.access & DeviceV2EndpointAccess.Read) !== 0,
      writable: (field.access & (DeviceV2EndpointAccess.Write | DeviceV2EndpointAccess.Command)) !== 0,
      notifies: (field.access & (DeviceV2EndpointAccess.Notify | DeviceV2EndpointAccess.Event)) !== 0,
      value: this.cloneValue(value?.value),
      minimum: constraints?.minimum,
      maximum: constraints?.maximum,
      step: constraints?.step,
      maxLength: constraints?.maxLength,
      unit: constraints?.unit,
      choices: constraints?.enumValues ? [...constraints.enumValues] : undefined,
      telemetryMinimumIntervalMs: field.telemetryMinimumIntervalMs,
    };
  }

  private mapEvent(event: DeviceV2Event): DeviceUiEvent {
    return {
      logicalDeviceId: event.logicalDeviceId,
      values: Object.fromEntries(Object.entries(event.values).map(
        ([key, value]) => [key, this.cloneValue(value.value)],
      )),
    };
  }

  private cloneValue(value: DeviceV2Value['value']): DeviceUiValue | undefined {
    return cloneUiValue(value);
  }

  private mapRole(kind: DeviceV2EndpointKind): DeviceUiEndpointRole {
    if (kind === DeviceV2EndpointKind.Property) return 'property';
    if (kind === DeviceV2EndpointKind.Action) return 'action';
    return 'event';
  }

  private mapValueType(type: DeviceV2ValueType): DeviceUiValueType {
    if (type === DeviceV2ValueType.Boolean) return 'boolean';
    if (type === DeviceV2ValueType.SignedInteger
      || type === DeviceV2ValueType.UnsignedInteger) return 'integer';
    if (type === DeviceV2ValueType.Float32 || type === DeviceV2ValueType.Float64) return 'number';
    if (type === DeviceV2ValueType.Text) return 'text';
    if (type === DeviceV2ValueType.Bytes) return 'bytes';
    if (type === DeviceV2ValueType.Object) return 'object';
    if (type === DeviceV2ValueType.Array) return 'array';
    return 'null';
  }
}
