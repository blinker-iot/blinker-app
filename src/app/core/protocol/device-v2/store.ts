import { bytesToHex, encodeCanonicalManifestPrefix } from './codec';
import {
  DeviceV2Event,
  DeviceV2EventBody,
  DeviceV2Manifest,
  DeviceV2ManifestField,
  DeviceV2ManifestPage,
  DeviceV2Patch,
  DeviceV2StatePage,
  DeviceV2TargetSnapshot,
  DeviceV2Value,
} from './types';

type StateListener = (logicalDeviceId: string, snapshot: DeviceV2TargetSnapshot) => void;
type EventListener = (event: DeviceV2Event) => void;
export type DeviceV2PatchResult = 'applied' | 'ignored' | 'resync';

interface ManifestTransfer {
  revision: number;
  fingerprint: string;
  totalFields: number;
  nextCursor: number;
  fields: DeviceV2ManifestField[];
  encodedFields: Uint8Array[];
  keys: Set<string>;
}

interface StateTransfer {
  revision: number | null;
  nextCursor: number;
  values: Record<string, DeviceV2Value>;
}

interface TargetState {
  manifest: DeviceV2Manifest | null;
  manifestAccepted: boolean;
  stateRevision: number | null;
  stateFresh: boolean;
  values: Record<string, DeviceV2Value>;
  eventInterrupted: boolean;
  manifestTransfer?: ManifestTransfer;
  stateTransfer?: StateTransfer;
}

function cloneField(field: DeviceV2ManifestField): DeviceV2ManifestField {
  return {
    ...field,
    constraints: field.constraints ? {
      ...field.constraints,
      enumValues: field.constraints.enumValues ? [...field.constraints.enumValues] : undefined,
    } : undefined,
  };
}

function cloneValue(value: DeviceV2Value): DeviceV2Value {
  return {
    ...value,
    cbor: new Uint8Array(value.cbor),
    value: value.value instanceof Uint8Array ? new Uint8Array(value.value) : value.value,
  };
}

function cloneValues(values: Record<string, DeviceV2Value>): Record<string, DeviceV2Value> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, cloneValue(value)]));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const material = new Uint8Array(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', material.buffer);
  return new Uint8Array(digest);
}

export class DeviceV2Store {
  private readonly targets = new Map<string, TargetState>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly eventListeners = new Set<EventListener>();

  constructor(
    private readonly hash: (input: Uint8Array) => Promise<Uint8Array> = sha256,
    private readonly maximumTargets = 256,
  ) {}

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  snapshot(logicalDeviceId: string): DeviceV2TargetSnapshot {
    return this.snapshotOf(this.target(logicalDeviceId));
  }

  async applyManifestPage(
    logicalDeviceId: string,
    page: DeviceV2ManifestPage,
  ): Promise<{ complete: boolean; nextCursor: number; manifest?: DeviceV2Manifest }> {
    const target = this.target(logicalDeviceId);
    const fingerprint = bytesToHex(page.fingerprint);
    if (page.cursor === 0) {
      target.manifestAccepted = false;
      target.stateFresh = false;
      target.eventInterrupted = true;
      target.stateTransfer = undefined;
      target.manifestTransfer = {
        revision: page.revision,
        fingerprint,
        totalFields: page.totalFields,
        nextCursor: 0,
        fields: [],
        encodedFields: [],
        keys: new Set<string>(),
      };
      this.notify(logicalDeviceId, target);
    }
    const transfer = target.manifestTransfer;
    if (!transfer || page.cursor !== transfer.nextCursor || page.revision !== transfer.revision
      || fingerprint !== transfer.fingerprint || page.totalFields !== transfer.totalFields) {
      throw new Error('Manifest page does not continue the active transfer');
    }
    for (const field of page.fields) {
      if (transfer.keys.has(field.key)) throw new Error('Manifest endpoint key is duplicated');
      transfer.keys.add(field.key);
      transfer.fields.push(cloneField(field));
    }
    transfer.encodedFields.push(...page.encodedFields.map(value => new Uint8Array(value)));
    transfer.nextCursor = page.nextCursor;
    if (page.nextCursor < page.totalFields) {
      return { complete: false, nextCursor: page.nextCursor };
    }

    const canonical = concat([
      encodeCanonicalManifestPrefix(transfer.revision, transfer.totalFields),
      ...transfer.encodedFields,
    ]);
    const actualFingerprint = bytesToHex(await this.hash(canonical));
    if (target.manifestTransfer !== transfer) {
      throw new Error('Manifest transfer was superseded');
    }
    if (actualFingerprint !== transfer.fingerprint) {
      target.manifestTransfer = undefined;
      throw new Error('Manifest fingerprint verification failed');
    }
    const previousFingerprint = target.manifest?.fingerprint;
    const manifest: DeviceV2Manifest = {
      revision: transfer.revision,
      fingerprint: transfer.fingerprint,
      fields: transfer.fields.map(cloneField),
    };
    target.manifest = manifest;
    target.manifestTransfer = undefined;
    if (previousFingerprint !== manifest.fingerprint) {
      target.stateRevision = null;
      target.values = Object.create(null);
    }
    this.notify(logicalDeviceId, target);
    return {
      complete: true,
      nextCursor: page.nextCursor,
      manifest: this.cloneManifest(manifest),
    };
  }

  markManifestAccepted(
    logicalDeviceId: string,
    revision: number,
    fingerprint: string,
  ): void {
    const target = this.target(logicalDeviceId);
    if (!target.manifest || target.manifest.revision !== revision
      || target.manifest.fingerprint !== fingerprint) {
      throw new Error('Manifest acceptance does not match the verified manifest');
    }
    target.manifestAccepted = true;
    target.eventInterrupted = false;
    this.notify(logicalDeviceId, target);
  }

  beginState(logicalDeviceId: string): void {
    const target = this.target(logicalDeviceId);
    if (!target.manifestAccepted) throw new Error('Manifest must be accepted before StateRequest');
    target.stateFresh = false;
    target.stateTransfer = {
      revision: null,
      nextCursor: 0,
      values: Object.create(null),
    };
    this.notify(logicalDeviceId, target);
  }

  applyStatePage(
    logicalDeviceId: string,
    page: DeviceV2StatePage,
  ): { complete: boolean; nextCursor: number; revision: number } {
    const target = this.target(logicalDeviceId);
    const transfer = target.stateTransfer;
    if (!target.manifestAccepted || !target.manifest || !transfer
      || page.totalFields !== target.manifest.fields.length
      || page.cursor !== transfer.nextCursor) {
      throw new Error('StatePage does not continue the active transfer');
    }
    if (transfer.revision === null) transfer.revision = page.revision;
    else if (transfer.revision !== page.revision) throw new Error('StatePage revision changed during transfer');
    for (const [key, value] of Object.entries(page.values)) {
      if (Object.prototype.hasOwnProperty.call(transfer.values, key)) {
        throw new Error('State endpoint is duplicated across pages');
      }
      transfer.values[key] = cloneValue(value);
    }
    transfer.nextCursor = page.nextCursor;
    if (page.nextCursor < page.totalFields) {
      return { complete: false, nextCursor: page.nextCursor, revision: page.revision };
    }
    target.values = transfer.values;
    target.stateRevision = page.revision;
    target.stateFresh = true;
    target.stateTransfer = undefined;
    this.notify(logicalDeviceId, target);
    return { complete: true, nextCursor: page.nextCursor, revision: page.revision };
  }

  applyPatch(logicalDeviceId: string, patch: DeviceV2Patch): DeviceV2PatchResult {
    const target = this.target(logicalDeviceId);
    if (patch.mode !== 0 || !target.manifestAccepted || !target.stateFresh
      || target.stateRevision === null) {
      this.markStateStale(logicalDeviceId, target);
      return 'resync';
    }
    if (patch.revision <= target.stateRevision) return 'ignored';
    if (target.stateRevision === 0xffffffff || patch.revision !== target.stateRevision + 1) {
      this.markStateStale(logicalDeviceId, target);
      return 'resync';
    }
    target.values = { ...target.values, ...cloneValues(patch.values) };
    target.stateRevision = patch.revision;
    this.notify(logicalDeviceId, target);
    return 'applied';
  }

  applyEvent(logicalDeviceId: string, body: DeviceV2EventBody): boolean {
    const target = this.target(logicalDeviceId);
    if (!target.manifestAccepted) return false;
    for (const listener of this.eventListeners) listener({
      logicalDeviceId,
      values: cloneValues(body.values),
    });
    return true;
  }

  resetSession(): void {
    for (const [logicalDeviceId, target] of this.targets) {
      target.manifestAccepted = false;
      target.stateFresh = false;
      target.eventInterrupted = true;
      target.manifestTransfer = undefined;
      target.stateTransfer = undefined;
      this.notify(logicalDeviceId, target);
    }
  }

  clear(): void {
    const logicalDeviceIds = [...this.targets.keys()];
    this.targets.clear();
    for (const logicalDeviceId of logicalDeviceIds) {
      const snapshot = this.snapshotOf({
        manifest: null,
        manifestAccepted: false,
        stateRevision: null,
        stateFresh: false,
        values: Object.create(null),
        eventInterrupted: true,
      });
      for (const listener of this.stateListeners) listener(logicalDeviceId, snapshot);
    }
  }

  invalidate(logicalDeviceId: string): void {
    const target = this.target(logicalDeviceId);
    target.manifestAccepted = false;
    target.stateFresh = false;
    target.eventInterrupted = true;
    target.manifestTransfer = undefined;
    target.stateTransfer = undefined;
    this.notify(logicalDeviceId, target);
  }

  private markStateStale(logicalDeviceId: string, target: TargetState): void {
    target.stateFresh = false;
    target.stateTransfer = undefined;
    this.notify(logicalDeviceId, target);
  }

  private target(logicalDeviceId: string): TargetState {
    if (!/^device_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      logicalDeviceId,
    )) {
      throw new Error('logical device identity is invalid');
    }
    let target = this.targets.get(logicalDeviceId);
    if (target) return target;
    if (this.targets.size >= this.maximumTargets) throw new Error('Device V2 target limit reached');
    target = {
      manifest: null,
      manifestAccepted: false,
      stateRevision: null,
      stateFresh: false,
      values: Object.create(null),
      eventInterrupted: true,
    };
    this.targets.set(logicalDeviceId, target);
    return target;
  }

  private notify(logicalDeviceId: string, target: TargetState): void {
    if (!this.stateListeners.size) return;
    for (const listener of this.stateListeners) {
      listener(logicalDeviceId, this.snapshotOf(target));
    }
  }

  private snapshotOf(target: TargetState): DeviceV2TargetSnapshot {
    return {
      manifest: target.manifest ? this.cloneManifest(target.manifest) : null,
      manifestAccepted: target.manifestAccepted,
      stateRevision: target.stateRevision,
      stateFresh: target.stateFresh,
      values: cloneValues(target.values),
      eventInterrupted: target.eventInterrupted,
    };
  }

  private cloneManifest(manifest: DeviceV2Manifest): DeviceV2Manifest {
    return {
      revision: manifest.revision,
      fingerprint: manifest.fingerprint,
      fields: manifest.fields.map(cloneField),
    };
  }
}
