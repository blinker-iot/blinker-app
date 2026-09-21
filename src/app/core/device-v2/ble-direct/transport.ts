import {
  BleCharacteristic,
  BleClient,
  BleDevice,
  BleService,
  ScanResult,
} from '@capacitor-community/bluetooth-le';
import { bleScanner } from '../../bluetooth/scan';

import {
  BleApplicationMode,
  BleModeProfile,
  BLINKER_BLE_RECEIVE_UUID,
  BLINKER_BLE_SERVICE_UUID,
  BLINKER_BLE_TRANSMIT_UUID,
  decodeBleModeProfile,
} from './wire';

const FRAGMENT_MAGIC = 0xb2;
const FRAGMENT_VERSION = 1;
const FRAGMENT_HEADER_SIZE = 4;
const GATT_PACKET_SIZE = 20;
const MAX_RECORD_SIZE = 1048;
const GATT_INTER_FRAGMENT_DELAY_MS = 30;

export interface BleDirectTarget {
  device: BleDevice;
  profile: BleModeProfile;
  rssi?: number;
}

export type BleDirectTargetMatcher = (
  target: BleDirectTarget,
) => boolean | Promise<boolean>;

// Family discovery is intentionally narrower than device identity. A scan
// result is Blinker only when both the frozen service UUID and the versioned
// service-data profile are valid. The profile never makes a Direct peripheral
// the caller's logical device; Method 2 still proves that relationship.
export function parseBlinkerAdvertisement(
  result: Pick<ScanResult, 'serviceData'>,
): BleModeProfile | undefined {
  const data = serviceData(result);
  if (!data) return undefined;
  try {
    return decodeBleModeProfile(data);
  } catch {
    return undefined;
  }
}

export interface BleDirectRecordLink {
  connect(target: BleDirectTarget): Promise<void>;
  waitForMode(
    mode: BleApplicationMode,
    timeoutMs?: number,
    matcher?: BleDirectTargetMatcher,
  ): Promise<BleDirectTarget>;
  sendRecord(record: Uint8Array, writeTimeoutMs?: number): Promise<void>;
  receiveRecord(timeoutMs?: number): Promise<Uint8Array>;
  disconnect(): Promise<void>;
}

// Caller-owned lifetime and policy, independent of MQTT, UI and owner codecs.
// Acquisition is checked at the native boundary; existing traffic can use the
// original bounded promise while a new revision is still being negotiated.
export interface BleDirectConnectionAdmission {
  readonly signal: AbortSignal;
  assertAcquire(): void;
  assertActive(): void;
  // Notification at actual native acquisition, not scan start.
  onAcquire?(): void;
  // Retire logical work immediately; this is NOT a native-release receipt.
  onClosed?(): void;
}

export async function discoverBlinkerDevice(
  mode: BleApplicationMode,
  timeoutMs = 15_000,
  excludedDeviceIds: ReadonlySet<string> = new Set(),
  signal?: AbortSignal,
  matcher?: BleDirectTargetMatcher,
): Promise<BleDirectTarget> {
  const deadline = performance.now() + timeoutMs;
  await initializeBle();
  if (performance.now() >= deadline) throw Error('BLE_DIRECT_SCAN_TIMEOUT');
  return scanFor(mode, Math.max(1, Math.ceil(deadline - performance.now())), undefined, excludedDeviceIds, signal, matcher);
}

export async function discoverBlinkerDevices(
  mode: BleApplicationMode,
  timeoutMs = 2_500,
  signal?: AbortSignal,
): Promise<BleDirectTarget[]> {
  const deadline = performance.now() + timeoutMs;
  await initializeBle();
  if (performance.now() >= deadline) throw Error('BLE_SCAN_DEADLINE');
  return scanForAll(mode, Math.max(1, Math.ceil(deadline - performance.now())), signal);
}

// A rejected native close is unknown physical capacity, across all record
// link instances in this process. Do not clear it on account/page replacement.
let nativeReleaseFailure: Error | undefined;

export class CapacitorBleDirectRecordLink implements BleDirectRecordLink {
  private target?: BleDirectTarget;
  private readonly packetSize = GATT_PACKET_SIZE;
  private writeWithoutResponse = false;
  private frameId = 0;
  private connected = false;
  private disconnected = false;
  private generation = 0;
  private detachAbort?: () => void;
  private disconnecting?: Promise<void>;
  private reassembler = new FragmentReassembler();
  private readonly records: Uint8Array[] = [];
  private readonly waiters: Array<{
    resolve(value: Uint8Array): void;
    reject(error: Error): void;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(private readonly admission?: BleDirectConnectionAdmission) {}

  async connect(target: BleDirectTarget): Promise<void> {
    if (this.connected) throw new Error('BLE_DIRECT_ALREADY_CONNECTED');
    validateTarget(target);
    const generation = ++this.generation;
    const check = () => {
      if (nativeReleaseFailure) throw nativeReleaseFailure;
      this.admission?.signal.throwIfAborted();
      if (generation !== this.generation) throw new Error('BLE_DIRECT_CONNECT_CANCELLED');
    };
    check();
    await this.disconnecting;
    await initializeBle();
    check();
    this.admission?.assertAcquire(); // After all async preparation, immediately before native acquisition.
    this.disconnecting = undefined;
    this.disconnected = false;
    this.target = {
      device: { ...target.device },
      profile: { ...target.profile, modeLocator: target.profile.modeLocator.slice() },
    };
    const abort = () => { void this.disconnect().catch(() => undefined); };
    this.admission?.signal.addEventListener('abort', abort, { once: true });
    this.detachAbort = () => this.admission?.signal.removeEventListener('abort', abort);
    try {
      this.admission?.onAcquire?.();
      await BleClient.connect(
        target.device.deviceId,
        () => { if (generation === this.generation) this.onDisconnected(); },
        { timeout: 15_000 },
      );
      check();
      let contract = findGattContract(await BleClient.getServices(target.device.deviceId));
      check();
      if (!contract) {
        await BleClient.discoverServices(target.device.deviceId);
        check();
        contract = findGattContract(await BleClient.getServices(target.device.deviceId));
        check();
      }
      if (!contract) throw new Error('BLE_DIRECT_GATT_CONTRACT_INVALID');
      this.writeWithoutResponse = !contract.receive.properties.write
        && contract.receive.properties.writeWithoutResponse;
      await BleClient.startNotifications(
        target.device.deviceId,
        BLINKER_BLE_SERVICE_UUID,
        BLINKER_BLE_TRANSMIT_UUID,
        value => {
          if (generation === this.generation) this.onFragment(new Uint8Array(
            value.buffer, value.byteOffset, value.byteLength,
          ).slice());
        },
      );
      check();
      this.connected = true;
    } catch (error) {
      if (generation !== this.generation || this.admission?.signal.aborted) {
        // An SDK connect may succeed AFTER cancellation's first disconnect.
        // Drain that cleanup, then close the late native result before allowing
        // the service's original opening slot to settle.
        await this.disconnecting;
        this.disconnecting = undefined;
      }
      await this.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async waitForMode(
    mode: BleApplicationMode,
    timeoutMs = 15_000,
    matcher?: BleDirectTargetMatcher,
  ): Promise<BleDirectTarget> {
    const deviceId = this.target?.device.deviceId;
    if (!deviceId || this.connected) throw new Error('BLE_DIRECT_DISCONNECT_REQUIRED');
    return scanFor(mode, timeoutMs, deviceId, new Set(), undefined, matcher);
  }

  async sendRecord(record: Uint8Array, writeTimeoutMs?: number): Promise<void> {
    this.admission?.signal.throwIfAborted();
    this.admission?.assertActive();
    if (!this.connected || !this.target || this.disconnected) {
      throw new Error('BLE_DIRECT_NOT_CONNECTED');
    }
    if (!record.length || record.length > MAX_RECORD_SIZE) {
      throw new Error('BLE_DIRECT_RECORD_SIZE');
    }
    if (writeTimeoutMs !== undefined
      && (!Number.isInteger(writeTimeoutMs) || writeTimeoutMs < 1)) {
      throw new Error('BLE_DIRECT_WRITE_TIMEOUT_INVALID');
    }
    this.frameId = this.frameId === 0xff ? 1 : this.frameId + 1;
    const fragments = fragmentBleRecord(record, this.packetSize, this.frameId);
    for (let index = 0; index < fragments.length; index += 1) {
      this.admission?.signal.throwIfAborted();
      this.admission?.assertActive();
      if (!this.connected || this.disconnected) throw new Error('BLE_DIRECT_NOT_CONNECTED');
      const fragment = fragments[index]!;
      const write = this.writeWithoutResponse
        ? BleClient.writeWithoutResponse.bind(BleClient)
        : BleClient.write.bind(BleClient);
      await write(
        this.target.device.deviceId,
        BLINKER_BLE_SERVICE_UUID,
        BLINKER_BLE_RECEIVE_UUID,
        new DataView(fragment.buffer),
        writeTimeoutMs === undefined ? undefined : { timeout: writeTimeoutMs },
      );
      // WRITE_TYPE_DEFAULT confirms delivery to the peripheral controller,
      // not necessarily consumption by a controller-to-host RPC bridge. Give
      // such split-radio boards one scheduling slice before the next fragment.
      if (index + 1 < fragments.length) {
        await new Promise(resolve => setTimeout(resolve, GATT_INTER_FRAGMENT_DELAY_MS));
      }
    }
  }

  receiveRecord(timeoutMs = 10_000): Promise<Uint8Array> {
    this.admission?.signal.throwIfAborted();
    this.admission?.assertActive();
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
      return Promise.reject(new Error('BLE_DIRECT_RECEIVE_TIMEOUT_INVALID'));
    }
    const record = this.records.shift();
    if (record) return Promise.resolve(record);
    if (!this.connected || this.disconnected) {
      return Promise.reject(new Error('BLE_DIRECT_NOT_CONNECTED'));
    }
    return new Promise((resolve, reject) => {
      const waiter: (typeof this.waiters)[number] = {
        resolve,
        reject,
      };
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          this.reassembler.reset();
          reject(new Error('BLE_DIRECT_RECEIVE_TIMEOUT'));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  async disconnect(): Promise<void> {
    if (this.disconnecting) return this.disconnecting;
    ++this.generation;
    this.detachAbort?.();
    this.detachAbort = undefined;
    const deviceId = this.target?.device.deviceId;
    this.connected = false;
    this.disconnected = true;
    this.reassembler.reset();
    this.records.length = 0;
    this.rejectWaiters('BLE_DIRECT_DISCONNECTED');
    if (!deviceId) return;
    this.disconnecting = Promise.resolve().then(async () => {
      await BleClient.stopNotifications(
        deviceId, BLINKER_BLE_SERVICE_UUID, BLINKER_BLE_TRANSMIT_UUID,
      ).catch(() => undefined);
      await BleClient.disconnect(deviceId);
    }).catch(() => {
      nativeReleaseFailure ??= new Error('BLE_DIRECT_NATIVE_RELEASE_FAILED');
      throw nativeReleaseFailure;
    });
    return this.disconnecting;
  }

  private onFragment(fragment: Uint8Array): void {
    if (!this.connected || this.disconnected) return;
    try {
      this.admission?.signal.throwIfAborted();
      this.admission?.assertActive();
      const record = this.reassembler.push(fragment, this.packetSize);
      if (!record) return;
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(record);
      } else if (this.records.length < 4) {
        this.records.push(record);
      } else {
        throw new Error('BLE_DIRECT_RECEIVE_QUEUE_FULL');
      }
    } catch (error) {
      this.onDisconnected(error instanceof Error ? error.message : 'BLE_DIRECT_FRAGMENT_INVALID');
      void this.disconnect().catch(() => undefined);
    }
  }

  private onDisconnected(reason = 'BLE_DIRECT_DISCONNECTED'): void {
    ++this.generation;
    this.connected = false;
    this.disconnected = true;
    this.reassembler.reset();
    this.records.length = 0;
    this.rejectWaiters(reason);
  }

  private rejectWaiters(reason: string): void {
    while (this.waiters.length) {
      const waiter = this.waiters.shift()!;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(new Error(reason));
    }
  }
}

export function fragmentBleRecord(
  record: Uint8Array,
  packetSize: number,
  frameId: number,
): Uint8Array[] {
  if (!(record instanceof Uint8Array) || !record.length || record.length > MAX_RECORD_SIZE
    || !Number.isInteger(packetSize) || packetSize <= FRAGMENT_HEADER_SIZE
    || packetSize > GATT_PACKET_SIZE
    || !Number.isInteger(frameId) || frameId < 1 || frameId > 0xff) {
    throw new Error('BLE_DIRECT_FRAGMENT_INPUT_INVALID');
  }
  const capacity = packetSize - FRAGMENT_HEADER_SIZE;
  const count = Math.ceil(record.length / capacity);
  if (count > 0x100) throw new Error('BLE_DIRECT_FRAGMENT_COUNT');
  const fragments: Uint8Array[] = [];
  for (let index = 0, offset = 0; offset < record.length; index += 1) {
    const size = Math.min(capacity, record.length - offset);
    const flags = (offset === 0 ? 1 : 0) | (offset + size === record.length ? 2 : 0);
    const fragment = new Uint8Array(FRAGMENT_HEADER_SIZE + size);
    fragment.set([
      FRAGMENT_MAGIC,
      (FRAGMENT_VERSION << 4) | flags,
      frameId,
      index,
    ]);
    fragment.set(record.subarray(offset, offset + size), FRAGMENT_HEADER_SIZE);
    fragments.push(fragment);
    offset += size;
  }
  return fragments;
}

function initializeBle(): Promise<void> {
  return BleClient.initialize({ androidNeverForLocation: true });
}

export class FragmentReassembler {
  private frameId = 0;
  private nextIndex = 0;
  private payloadCapacity = 0;
  private chunks: Uint8Array[] = [];
  private size = 0;

  push(fragment: Uint8Array, packetSize: number): Uint8Array | undefined {
    if (packetSize <= FRAGMENT_HEADER_SIZE || fragment.length <= FRAGMENT_HEADER_SIZE
      || fragment.length > packetSize || fragment[0] !== FRAGMENT_MAGIC
      || (fragment[1]! >> 4) !== FRAGMENT_VERSION
      || (fragment[1]! & 0x0c) !== 0 || fragment[2] === 0) {
      return this.fail();
    }
    const flags = fragment[1]! & 0x03;
    const start = (flags & 1) !== 0;
    const end = (flags & 2) !== 0;
    const frameId = fragment[2]!;
    const index = fragment[3]!;
    const payload = fragment.slice(FRAGMENT_HEADER_SIZE);
    if (start) {
      if (this.frameId !== 0 || index !== 0) return this.fail();
      this.frameId = frameId;
      this.payloadCapacity = packetSize - FRAGMENT_HEADER_SIZE;
    } else if (this.frameId === 0 || frameId !== this.frameId || index !== this.nextIndex) {
      return this.fail();
    }
    if ((!end && payload.length !== this.payloadCapacity)
      || (end && payload.length > this.payloadCapacity)
      || this.size + payload.length > MAX_RECORD_SIZE) {
      return this.fail();
    }
    this.chunks.push(payload);
    this.size += payload.length;
    this.nextIndex += 1;
    if (!end) return undefined;
    const output = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    this.reset();
    return output;
  }

  reset(): void {
    this.frameId = 0;
    this.nextIndex = 0;
    this.payloadCapacity = 0;
    this.chunks = [];
    this.size = 0;
  }

  private fail(): never {
    this.reset();
    throw new Error('BLE_DIRECT_FRAGMENT_INVALID');
  }
}

async function scanFor(
  mode: BleApplicationMode,
  timeoutMs: number,
  deviceId?: string,
  excludedDeviceIds: ReadonlySet<string> = new Set(),
  signal?: AbortSignal,
  matcher?: BleDirectTargetMatcher,
): Promise<BleDirectTarget> {
  let selected: BleDirectTarget | undefined, matchError: unknown, matching = false, finished = false;
  const pending: BleDirectTarget[] = [], evaluated = new Set<string>();
  const deadline = performance.now() + timeoutMs;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    await bleScanner.run([BLINKER_BLE_SERVICE_UUID], timeoutMs, abort.signal, (result, finish) => {
      if (deviceId && result.device.deviceId !== deviceId || excludedDeviceIds.has(result.device.deviceId)) return;
      const profile = parseBlinkerAdvertisement(result);
      if (profile?.mode !== mode) return;
      const target = { device: result.device, profile, rssi: result.rssi };
      if (!matcher) { selected = target; finish(); return; }
      const key = scanIdentity(target);
      // Bound crypto work/candidates even in a crowded or hostile RF environment.
      if (evaluated.has(key) || evaluated.size >= 64 || pending.length >= 16) return;
      evaluated.add(key); pending.push(target);
      if (matching) return;
      matching = true;
      void (async () => {
        try {
          while (!finished && !abort.signal.aborted && pending.length) {
            const candidate = pending.shift()!;
            if (await matcher(candidate)) {
              if (!finished && !abort.signal.aborted && performance.now() < deadline) { selected = candidate; finish(); }
              return;
            }
          }
        } catch (error) { if (!finished) { matchError = error; abort.abort(); } }
        finally { matching = false; }
      })();
    });
    if (!selected) throw Error('BLE_DIRECT_SCAN_TIMEOUT');
    return selected;
  } catch (error) {
    if (matchError) throw matchError;
    if (error instanceof Error && error.message === 'BLE_SCAN_CANCELLED') throw Error('BLE_DIRECT_SCAN_CANCELLED');
    throw error;
  } finally {
    finished = true; abort.abort(); pending.length = 0;
    signal?.removeEventListener('abort', cancel);
  }
}

async function scanForAll(mode: BleApplicationMode, timeoutMs: number, signal?: AbortSignal): Promise<BleDirectTarget[]> {
  const found = new Map<string, BleDirectTarget>();
  await bleScanner.run([BLINKER_BLE_SERVICE_UUID], timeoutMs, signal, result => {
    const profile = parseBlinkerAdvertisement(result);
    if (profile?.mode !== mode) return;
    const target = { device: result.device, profile, rssi: result.rssi }, key = scanIdentity(target);
    if (found.has(key) || found.size < 64) found.set(key, target);
  });
  return [...found.values()];
}

function scanIdentity(target: BleDirectTarget): string {
  if (target.profile.modeLocator.some(byte => byte !== 0)) {
    return `${target.profile.mode}:${target.profile.wireVersion}:${
      [...target.profile.modeLocator]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
    }`;
  }
  return `transport:${target.device.deviceId.toLowerCase()}`;
}

function serviceData(result: Pick<ScanResult, 'serviceData'>): DataView | undefined {
  if (!result.serviceData) return undefined;
  const match = Object.entries(result.serviceData).find(
    ([uuid]) => normalizeUuid(uuid) === BLINKER_BLE_SERVICE_UUID,
  );
  return match?.[1];
}

function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

function findGattContract(services: BleService[]): {
  receive: BleCharacteristic;
  transmit: BleCharacteristic;
} | undefined {
  const service = services.find(item => normalizeUuid(item.uuid) === BLINKER_BLE_SERVICE_UUID);
  const receive = service?.characteristics.find(
    item => normalizeUuid(item.uuid) === BLINKER_BLE_RECEIVE_UUID,
  );
  const transmit = service?.characteristics.find(
    item => normalizeUuid(item.uuid) === BLINKER_BLE_TRANSMIT_UUID,
  );
  return receive && (receive.properties.write || receive.properties.writeWithoutResponse)
    && transmit && (transmit.properties.notify || transmit.properties.indicate)
    ? { receive, transmit }
    : undefined;
}

function validateTarget(target: BleDirectTarget): void {
  if (!target?.device?.deviceId || !target.profile
    || (target.profile.mode !== BleApplicationMode.Provisioning
      && target.profile.mode !== BleApplicationMode.Direct)) {
    throw new Error('BLE_DIRECT_TARGET_INVALID');
  }
}
