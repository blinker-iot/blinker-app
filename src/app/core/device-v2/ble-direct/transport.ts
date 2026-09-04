import {
  BleCharacteristic,
  BleClient,
  BleDevice,
  BleService,
  ScanMode,
  ScanResult,
} from '@capacitor-community/bluetooth-le';

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

export async function discoverBlinkerDevice(
  mode: BleApplicationMode,
  timeoutMs = 15_000,
  excludedDeviceIds: ReadonlySet<string> = new Set(),
  signal?: AbortSignal,
  matcher?: BleDirectTargetMatcher,
): Promise<BleDirectTarget> {
  await initializeBle();
  return scanFor(mode, timeoutMs, undefined, excludedDeviceIds, signal, matcher);
}

export async function discoverBlinkerDevices(
  mode: BleApplicationMode,
  timeoutMs = 2_500,
  signal?: AbortSignal,
): Promise<BleDirectTarget[]> {
  await initializeBle();
  return scanForAll(mode, timeoutMs, signal);
}

export class CapacitorBleDirectRecordLink implements BleDirectRecordLink {
  private target?: BleDirectTarget;
  private readonly packetSize = GATT_PACKET_SIZE;
  private writeWithoutResponse = false;
  private frameId = 0;
  private connected = false;
  private disconnected = false;
  private reassembler = new FragmentReassembler();
  private readonly records: Uint8Array[] = [];
  private readonly waiters: Array<{
    resolve(value: Uint8Array): void;
    reject(error: Error): void;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  async connect(target: BleDirectTarget): Promise<void> {
    if (this.connected) throw new Error('BLE_DIRECT_ALREADY_CONNECTED');
    validateTarget(target);
    await initializeBle();
    this.disconnected = false;
    this.target = {
      device: { ...target.device },
      profile: { ...target.profile, modeLocator: target.profile.modeLocator.slice() },
    };
    try {
      await BleClient.connect(
        target.device.deviceId,
        () => this.onDisconnected(),
        { timeout: 15_000 },
      );
      let contract = findGattContract(await BleClient.getServices(target.device.deviceId));
      if (!contract) {
        await BleClient.discoverServices(target.device.deviceId);
        contract = findGattContract(await BleClient.getServices(target.device.deviceId));
      }
      if (!contract) throw new Error('BLE_DIRECT_GATT_CONTRACT_INVALID');
      this.writeWithoutResponse = !contract.receive.properties.write
        && contract.receive.properties.writeWithoutResponse;
      await BleClient.startNotifications(
        target.device.deviceId,
        BLINKER_BLE_SERVICE_UUID,
        BLINKER_BLE_TRANSMIT_UUID,
        value => this.onFragment(new Uint8Array(
          value.buffer, value.byteOffset, value.byteLength,
        ).slice()),
      );
      this.connected = true;
    } catch (error) {
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
    const deviceId = this.target?.device.deviceId;
    this.connected = false;
    this.disconnected = true;
    this.reassembler.reset();
    this.records.length = 0;
    this.rejectWaiters('BLE_DIRECT_DISCONNECTED');
    if (!deviceId) return;
    await BleClient.stopNotifications(
      deviceId, BLINKER_BLE_SERVICE_UUID, BLINKER_BLE_TRANSMIT_UUID,
    ).catch(() => undefined);
    await BleClient.disconnect(deviceId).catch(() => undefined);
  }

  private onFragment(fragment: Uint8Array): void {
    if (!this.connected || this.disconnected) return;
    try {
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
      void this.disconnect();
    }
  }

  private onDisconnected(reason = 'BLE_DIRECT_DISCONNECTED'): void {
    this.connected = false;
    this.disconnected = true;
    this.reassembler.reset();
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
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('BLE_DIRECT_SCAN_TIMEOUT_INVALID');
  }
  if (signal?.aborted) throw new Error('BLE_DIRECT_SCAN_CANCELLED');
  return new Promise<BleDirectTarget>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let abort = () => undefined;
    let matching = false;
    const pending: BleDirectTarget[] = [];
    const evaluated = new Set<string>();
    const finish = (target?: BleDirectTarget, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void BleClient.stopLEScan().catch(() => undefined);
      if (target) resolve(target);
      else reject(error ?? new Error('BLE_DIRECT_SCAN_FAILED'));
    };
    abort = () => finish(undefined, new Error('BLE_DIRECT_SCAN_CANCELLED'));
    timer = setTimeout(() => finish(undefined, new Error('BLE_DIRECT_SCAN_TIMEOUT')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const matchPending = async () => {
      if (matching || settled || !matcher) return;
      matching = true;
      try {
        while (!settled && pending.length) {
          const target = pending.shift()!;
          if (await matcher(target)) {
            finish(target);
            return;
          }
        }
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error(String(error)));
      } finally {
        matching = false;
        if (!settled && pending.length) void matchPending();
      }
    };
    void BleClient.requestLEScan({
      services: [BLINKER_BLE_SERVICE_UUID],
      allowDuplicates: true,
      scanMode: ScanMode.SCAN_MODE_LOW_LATENCY,
    }, result => {
      if (deviceId && result.device.deviceId !== deviceId) return;
      if (excludedDeviceIds.has(result.device.deviceId)) return;
      const profile = parseBlinkerAdvertisement(result);
      if (profile?.mode === mode) {
        const target = { device: result.device, profile, rssi: result.rssi };
        if (!matcher) {
          finish(target);
          return;
        }
        const key = scanIdentity(target);
        if (evaluated.has(key)) return;
        evaluated.add(key);
        pending.push(target);
        void matchPending();
      }
    }).catch(error => finish(undefined, error instanceof Error ? error : new Error(String(error))));
  });
}

async function scanForAll(
  mode: BleApplicationMode,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<BleDirectTarget[]> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('BLE_DIRECT_SCAN_TIMEOUT_INVALID');
  }
  if (signal?.aborted) throw new Error('BLE_DIRECT_SCAN_CANCELLED');
  return new Promise<BleDirectTarget[]>((resolve, reject) => {
    const found = new Map<string, BleDirectTarget>();
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let abort = () => undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void BleClient.stopLEScan().catch(() => undefined).then(() => {
        if (error) reject(error);
        else resolve([...found.values()]);
      });
    };
    abort = () => finish(new Error('BLE_DIRECT_SCAN_CANCELLED'));
    timer = setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    void BleClient.requestLEScan({
      services: [BLINKER_BLE_SERVICE_UUID],
      allowDuplicates: true,
      scanMode: ScanMode.SCAN_MODE_LOW_LATENCY,
    }, result => {
      const profile = parseBlinkerAdvertisement(result);
      if (profile?.mode === mode) {
        const target = {
          device: result.device,
          profile,
          rssi: result.rssi,
        };
        // Android may report one physical peripheral under more than one
        // transport address. The authenticated/provisioning locator identifies
        // the current advertising session; a MAC address does not.
        found.set(scanIdentity(target), target);
      }
    }).catch(error => finish(error instanceof Error ? error : new Error(String(error))));
  });
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
