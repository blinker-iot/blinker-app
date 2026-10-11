import {
  BBP2_MAX_TELEMETRY_FIELDS,
  BBP2_TELEMETRY_MAXIMUM_INTERVAL_MS,
  BBP2_TELEMETRY_MAXIMUM_LEASE_MS,
  BBP2_TELEMETRY_MINIMUM_INTERVAL_MS,
  BBP2_TELEMETRY_MINIMUM_LEASE_MS,
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2ManifestField,
  DeviceV2TelemetryControl,
  DeviceV2TelemetryData,
  DeviceV2TelemetryOperation,
  DeviceV2TelemetryStatus,
  DeviceV2TelemetryStatusCode,
  DeviceV2Value,
} from './types';

const DEFAULT_LEASE_MS = 30000;
const MAX_STREAMS = 16;

export interface DeviceV2TelemetryOptions {
  leaseMs?: number;
  visible?: boolean;
}

export interface DeviceV2TelemetrySnapshot {
  active: boolean;
  visible: boolean;
  streamId: number;
  epoch: number;
  effectiveIntervalMs: number;
  sampleSequence?: number;
  /** Device uptime of the sample, not a UTC timestamp. */
  sampleMonotonicMs?: number;
  receivedAtMs?: number;
  /** Local monotonic receipt time used for freshness, independent of wall-clock changes. */
  receivedMonotonicMs?: number;
  missedSamples: number;
  values: Readonly<Record<string, DeviceV2Value>>;
}

interface TelemetryClock {
  wallNow(): number;
  monotonicNow(): number;
}

type Listener = (snapshot: DeviceV2TelemetrySnapshot) => void;

interface LeaseState {
  logicalDeviceId: string;
  fields: DeviceV2ManifestField[];
  streamId: number;
  epoch: number;
  intervalMs: number;
  effectiveIntervalMs: number;
  leaseMs: number;
  sampleSequence?: number;
  sampleMonotonicMs?: number;
  receivedAtMs?: number;
  receivedMonotonicMs?: number;
  missedSamples: number;
  active: boolean;
  visible: boolean;
  closing: boolean;
  closed: boolean;
  closeOnReset: boolean;
  transition: Promise<void>;
  values: Record<string, DeviceV2Value>;
  listeners: Set<Listener>;
  renewTimer?: ReturnType<typeof setTimeout>;
}

function cloneValue(value: DeviceV2Value): DeviceV2Value {
  return {
    ...value,
    cbor: new Uint8Array(value.cbor),
    value: value.value instanceof Uint8Array ? new Uint8Array(value.value) : value.value,
  };
}

function newerSequence(value: number, previous: number | undefined): boolean {
  if (previous === undefined) return true;
  const difference = (value - previous) >>> 0;
  return difference !== 0 && difference < 0x80000000;
}

export class DeviceV2TelemetryLease {
  constructor(
    private readonly manager: DeviceV2TelemetryManager,
    private readonly lease: LeaseState,
  ) {}

  get snapshot(): DeviceV2TelemetrySnapshot {
    return this.manager.snapshot(this.lease);
  }

  subscribe(listener: Listener): () => void {
    this.lease.listeners.add(listener);
    listener(this.snapshot);
    return () => this.lease.listeners.delete(listener);
  }

  setVisible(visible: boolean): Promise<void> {
    return this.manager.setVisible(this.lease, visible);
  }

  close(): Promise<void> {
    return this.manager.close(this.lease);
  }
}

export class DeviceV2TelemetryManager {
  private readonly leases = new Set<LeaseState>();
  private nextStreamId = 1;
  private generation = 0;

  constructor(
    private readonly prepare: (
      logicalDeviceId: string,
      endpointKeys: string[],
    ) => Promise<DeviceV2ManifestField[]>,
    private readonly send: (
      logicalDeviceId: string,
      control: DeviceV2TelemetryControl,
    ) => Promise<DeviceV2TelemetryStatus>,
    private readonly error: (error: Error) => void,
    private readonly clock: TelemetryClock = {
      wallNow: () => Date.now(),
      monotonicNow: () => performance.now(),
    },
  ) {}

  async open(
    logicalDeviceId: string,
    endpointKeys: string[],
    intervalMs: number,
    options: DeviceV2TelemetryOptions = {},
  ): Promise<DeviceV2TelemetryLease> {
    if (this.leases.size >= MAX_STREAMS) throw new Error('Device V2 telemetry stream limit reached');
    if (!Number.isInteger(intervalMs) || intervalMs < BBP2_TELEMETRY_MINIMUM_INTERVAL_MS
      || intervalMs > BBP2_TELEMETRY_MAXIMUM_INTERVAL_MS) {
      throw new Error('Device V2 telemetry interval is invalid');
    }
    const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    if (!Number.isInteger(leaseMs) || leaseMs < BBP2_TELEMETRY_MINIMUM_LEASE_MS
      || leaseMs > BBP2_TELEMETRY_MAXIMUM_LEASE_MS) {
      throw new Error('Device V2 telemetry lease is invalid');
    }
    const generation = this.generation;
    const fields = await this.prepare(logicalDeviceId, endpointKeys);
    if (generation !== this.generation) throw new Error('Device V2 telemetry manager was reset');
    if (this.leases.size >= MAX_STREAMS) throw new Error('Device V2 telemetry stream limit reached');
    const lease: LeaseState = {
      logicalDeviceId,
      fields,
      streamId: this.allocateStreamId(),
      epoch: 0,
      intervalMs,
      effectiveIntervalMs: intervalMs,
      leaseMs,
      missedSamples: 0,
      active: false,
      visible: options.visible !== false,
      closing: false,
      closed: false,
      closeOnReset: false,
      transition: Promise.resolve(),
      values: Object.create(null),
      listeners: new Set<Listener>(),
    };
    this.leases.add(lease);
    if (lease.visible) {
      try {
        await this.openLease(lease);
      } catch (error) {
        this.leases.delete(lease);
        throw error;
      }
    }
    return new DeviceV2TelemetryLease(this, lease);
  }

  async setVisible(lease: LeaseState, visible: boolean): Promise<void> {
    if (lease.closed || lease.closing || !this.leases.has(lease)) {
      throw new Error('Device V2 telemetry lease is closed');
    }
    lease.visible = visible;
    if (!visible) this.clearSamples(lease);
    this.notify(lease);
    await this.enqueue(lease, () => this.reconcileVisibility(lease));
  }

  async close(lease: LeaseState): Promise<void> {
    if (lease.closed) return;
    if (lease.closing) {
      await lease.transition;
      return;
    }
    lease.closing = true;
    lease.visible = false;
    this.clearSamples(lease);
    this.notify(lease);
    await this.enqueue(lease, async () => {
      try {
        await this.stopLease(lease);
      } finally {
        lease.active = false;
        this.clearSamples(lease);
        this.notify(lease);
        lease.closed = true;
        lease.listeners.clear();
        this.leases.delete(lease);
      }
    });
  }

  receiveData(logicalDeviceId: string, data: DeviceV2TelemetryData): void {
    const lease = this.activeLease(logicalDeviceId, data.streamId, data.epoch);
    if (!lease || !newerSequence(data.sampleSequence, lease.sampleSequence)) return;
    const allowed = new Set(lease.fields.map(field => field.key));
    if (Object.keys(data.values).some(key => !allowed.has(key))) {
      throw new Error('Device V2 telemetry sample contains an unrequested endpoint');
    }
    if (lease.sampleSequence !== undefined) {
      const distance = (data.sampleSequence - lease.sampleSequence) >>> 0;
      // Sequence zero is reserved and skipped by the device on wraparound.
      lease.missedSamples += distance - 1 - Number(data.sampleSequence < lease.sampleSequence);
    }
    lease.sampleSequence = data.sampleSequence;
    lease.sampleMonotonicMs = data.monotonicMs;
    lease.receivedAtMs = this.clock.wallNow();
    lease.receivedMonotonicMs = this.clock.monotonicNow();
    lease.values = Object.fromEntries(
      Object.entries(data.values).map(([key, value]) => [key, cloneValue(value)]),
    );
    this.notify(lease);
  }

  receiveStatus(logicalDeviceId: string, status: DeviceV2TelemetryStatus): void {
    if (status.status !== DeviceV2TelemetryStatusCode.Opened
      && status.status !== DeviceV2TelemetryStatusCode.Renewed
      && status.status !== DeviceV2TelemetryStatusCode.Closed
      && status.status !== DeviceV2TelemetryStatusCode.Expired) return;
    const lease = Array.from(this.leases).find(candidate => (
      candidate.logicalDeviceId === logicalDeviceId && candidate.streamId === status.streamId
      && candidate.epoch === status.epoch
    ));
    if (!lease || lease.closed || lease.closing || !lease.active || !lease.visible) return;
    lease.effectiveIntervalMs = status.effectiveIntervalMs;
    if (status.status === DeviceV2TelemetryStatusCode.Closed
      || status.status === DeviceV2TelemetryStatusCode.Expired) {
      clearTimeout(lease.renewTimer);
      lease.active = false;
      this.clearSamples(lease);
      this.notify(lease);
      if (lease.visible && !lease.closing
        && status.status === DeviceV2TelemetryStatusCode.Expired) {
        void this.enqueue(lease, () => this.reconcileVisibility(lease))
          .catch(error => this.error(error as Error));
      }
    } else this.notify(lease);
  }

  /** Pinned descriptors only for a currently active lease, never a new Manifest's IDs. */
  fieldsForData(logicalDeviceId: string, streamId: number, epoch: number): DeviceV2ManifestField[] | undefined {
    const lease = this.activeLease(logicalDeviceId, streamId, epoch);
    if (!lease) return undefined;
    // The existing ID decoder indexes by id - 1. Unrequested positions stay
    // empty so neither a different key nor an unrequested field can decode.
    const fields: DeviceV2ManifestField[] = [];
    for (const field of lease.fields) fields[field.id - 1] = field;
    return fields;
  }

  reset(closeActive = false): void {
    this.generation += 1;
    const remote: Array<{ logicalDeviceId: string; streamId: number; epoch: number }> = [];
    for (const lease of this.leases) {
      if (closeActive && lease.active) remote.push(lease);
      lease.closeOnReset = closeActive;
      clearTimeout(lease.renewTimer);
      lease.active = false;
      lease.visible = false;
      lease.closing = true;
      lease.closed = true;
      this.clearSamples(lease);
      this.notify(lease);
      lease.listeners.clear();
    }
    this.leases.clear();
    // Queue existing Close controls but never await them from a carrier's own
    // operation queue. Local retirement is immediate, including failed Close.
    for (const lease of remote) this.closeResetLease(lease.logicalDeviceId, lease.streamId, lease.epoch);
  }

  snapshot(lease: LeaseState): DeviceV2TelemetrySnapshot {
    const values = Object.fromEntries(
      Object.entries(lease.values).map(([key, value]) => [key, cloneValue(value)]),
    );
    return {
      active: lease.active,
      visible: lease.visible,
      streamId: lease.streamId,
      epoch: lease.epoch,
      effectiveIntervalMs: lease.effectiveIntervalMs,
      sampleSequence: lease.sampleSequence,
      sampleMonotonicMs: lease.sampleMonotonicMs,
      receivedAtMs: lease.receivedAtMs,
      receivedMonotonicMs: lease.receivedMonotonicMs,
      missedSamples: lease.missedSamples,
      values,
    };
  }

  private async openLease(lease: LeaseState): Promise<void> {
    clearTimeout(lease.renewTimer);
    const status = await this.send(lease.logicalDeviceId, {
      operation: DeviceV2TelemetryOperation.Open,
      streamId: lease.streamId,
      leaseMs: lease.leaseMs,
      intervalMs: lease.intervalMs,
      fieldIds: lease.fields.map(field => field.id),
    });
    if (lease.closed || !this.leases.has(lease)) {
      if (lease.closeOnReset && status.status === DeviceV2TelemetryStatusCode.Opened
        && status.streamId === lease.streamId) {
        this.closeResetLease(lease.logicalDeviceId, status.streamId, status.epoch);
      }
      throw new Error('Device V2 telemetry lease is closed');
    }
    if (status.status !== DeviceV2TelemetryStatusCode.Opened
      || status.streamId !== lease.streamId) {
      throw new Error('Device V2 telemetry open status is invalid');
    }
    lease.epoch = status.epoch;
    lease.effectiveIntervalMs = status.effectiveIntervalMs;
    this.clearSamples(lease);
    lease.active = true;
    if (lease.visible && !lease.closing) {
      this.scheduleRenew(lease);
      this.notify(lease);
    }
  }

  private async stopLease(lease: LeaseState): Promise<void> {
    clearTimeout(lease.renewTimer);
    if (!lease.active) return;
    lease.active = false;
    this.clearSamples(lease);
    this.notify(lease);
    const status = await this.send(lease.logicalDeviceId, {
      operation: DeviceV2TelemetryOperation.Close,
      streamId: lease.streamId,
      epoch: lease.epoch,
    });
    if (status.status !== DeviceV2TelemetryStatusCode.Closed
      || status.streamId !== lease.streamId || status.epoch !== lease.epoch) {
      throw new Error('Device V2 telemetry close status is invalid');
    }
  }

  private async reconcileVisibility(lease: LeaseState): Promise<void> {
    if (lease.closed || lease.closing) return;
    if (lease.visible === lease.active) return;
    if (lease.visible) await this.openLease(lease);
    else {
      await this.stopLease(lease);
      this.notify(lease);
    }
  }

  private scheduleRenew(lease: LeaseState): void {
    clearTimeout(lease.renewTimer);
    lease.renewTimer = setTimeout(() => {
      void this.enqueue(lease, async () => {
        if (!lease.active || !lease.visible || lease.closing || lease.closed) return;
        const status = await this.send(lease.logicalDeviceId, {
          operation: DeviceV2TelemetryOperation.Renew,
          streamId: lease.streamId,
          epoch: lease.epoch,
          leaseMs: lease.leaseMs,
        });
        if (!lease.active || !lease.visible || lease.closing || lease.closed) return;
        if (status.status !== DeviceV2TelemetryStatusCode.Renewed
          || status.streamId !== lease.streamId || status.epoch !== lease.epoch) {
          throw new Error('Device V2 telemetry renew status is invalid');
        }
        lease.effectiveIntervalMs = status.effectiveIntervalMs;
        this.notify(lease);
        this.scheduleRenew(lease);
      }).catch(error => {
        if (lease.closed) return;
        lease.active = false;
        this.clearSamples(lease);
        this.notify(lease);
        this.error(error as Error);
      });
    }, Math.max(BBP2_TELEMETRY_MINIMUM_LEASE_MS, Math.floor(lease.leaseMs / 3)));
  }

  private enqueue(lease: LeaseState, action: () => Promise<void>): Promise<void> {
    const result = lease.transition.then(action);
    lease.transition = result.catch(() => undefined);
    return result;
  }

  private allocateStreamId(): number {
    const streamId = this.nextStreamId;
    this.nextStreamId = streamId >= 0xffffffff ? 1 : streamId + 1;
    return streamId;
  }

  private activeLease(logicalDeviceId: string, streamId: number, epoch: number): LeaseState | undefined {
    return Array.from(this.leases).find(candidate => (
      candidate.logicalDeviceId === logicalDeviceId && candidate.streamId === streamId
      && candidate.epoch === epoch && candidate.active && candidate.visible
      && !candidate.closing && !candidate.closed
    ));
  }

  private closeResetLease(logicalDeviceId: string, streamId: number, epoch: number): void {
    try {
      void this.send(logicalDeviceId, { operation: DeviceV2TelemetryOperation.Close, streamId, epoch })
        .catch(() => undefined);
    } catch {
      // A retired or failing carrier is not a reason to revive this stream.
    }
  }

  private notify(lease: LeaseState): void {
    if (!lease.listeners.size) return;
    const snapshot = this.snapshot(lease);
    for (const listener of lease.listeners) listener(snapshot);
  }

  private clearSamples(lease: LeaseState): void {
    lease.sampleSequence = undefined;
    lease.sampleMonotonicMs = undefined;
    lease.receivedAtMs = undefined;
    lease.receivedMonotonicMs = undefined;
    lease.missedSamples = 0;
    lease.values = Object.create(null);
  }
}

export function validateDeviceV2TelemetryFields(
  fields: DeviceV2ManifestField[],
  endpointKeys: string[],
): DeviceV2ManifestField[] {
  if (endpointKeys.length === 0 || endpointKeys.length > BBP2_MAX_TELEMETRY_FIELDS
    || new Set(endpointKeys).size !== endpointKeys.length) {
    throw new Error('Device V2 telemetry endpoint list is invalid');
  }
  const selected = endpointKeys.map(key => fields.find(field => field.key === key));
  if (selected.some(field => !field || field.kind !== DeviceV2EndpointKind.Property
    || (field.access & DeviceV2EndpointAccess.Read) === 0
    || (field.access & DeviceV2EndpointAccess.Write) !== 0
    || !field.telemetryMinimumIntervalMs)) {
    throw new Error('Device V2 endpoint is not realtime telemetry');
  }
  return (selected as DeviceV2ManifestField[]).sort((left, right) => left.id - right.id);
}
