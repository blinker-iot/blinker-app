import {
  BleClient,
  BleDevice,
  ScanMode,
  ScanResult,
} from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

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
const MAX_RECORD_SIZE = 1048;
const ANDROID_BOND_TIMEOUT_MS = 45_000;

export interface BleDirectTarget {
  device: BleDevice;
  profile: BleModeProfile;
}

export interface BleDirectRecordLink {
  connect(target: BleDirectTarget): Promise<void>;
  waitForMode(mode: BleApplicationMode, timeoutMs?: number): Promise<BleDirectTarget>;
  sendRecord(record: Uint8Array): Promise<void>;
  receiveRecord(timeoutMs?: number): Promise<Uint8Array>;
  disconnect(): Promise<void>;
}

export async function discoverBlinkerDevice(
  mode: BleApplicationMode,
  timeoutMs = 15_000,
  excludedDeviceIds: ReadonlySet<string> = new Set(),
  signal?: AbortSignal,
): Promise<BleDirectTarget> {
  await initializeBle();
  return scanFor(mode, timeoutMs, undefined, excludedDeviceIds, signal);
}

export class CapacitorBleDirectRecordLink implements BleDirectRecordLink {
  private target?: BleDirectTarget;
  private packetSize = 20;
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
      profile: { ...target.profile, setupSessionLocator: target.profile.setupSessionLocator.slice() },
    };
    try {
      await BleClient.connect(
        target.device.deviceId,
        () => this.onDisconnected(),
        { timeout: 15_000 },
      );
      if (Capacitor.getPlatform() === 'android'
        && !(await BleClient.isBonded(target.device.deviceId))) {
        await BleClient.createBond(target.device.deviceId, {
          timeout: ANDROID_BOND_TIMEOUT_MS,
        });
      }
      const services = await BleClient.getServices(target.device.deviceId);
      const service = services.find(item => normalizeUuid(item.uuid) === BLINKER_BLE_SERVICE_UUID);
      const receive = service?.characteristics.find(
        item => normalizeUuid(item.uuid) === BLINKER_BLE_RECEIVE_UUID,
      );
      const transmit = service?.characteristics.find(
        item => normalizeUuid(item.uuid) === BLINKER_BLE_TRANSMIT_UUID,
      );
      if (!receive || (!receive.properties.write && !receive.properties.writeWithoutResponse)
        || !transmit || (!transmit.properties.notify && !transmit.properties.indicate)) {
        throw new Error('BLE_DIRECT_GATT_CONTRACT_INVALID');
      }
      this.writeWithoutResponse = !receive.properties.write
        && receive.properties.writeWithoutResponse;
      this.packetSize = Math.max(20, Math.min(
        512,
        (await BleClient.getMtu(target.device.deviceId).catch(() => 23)) - 3,
      ));
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
  ): Promise<BleDirectTarget> {
    const deviceId = this.target?.device.deviceId;
    if (!deviceId || this.connected) throw new Error('BLE_DIRECT_DISCONNECT_REQUIRED');
    return scanFor(mode, timeoutMs, deviceId);
  }

  async sendRecord(record: Uint8Array): Promise<void> {
    if (!this.connected || !this.target || this.disconnected) {
      throw new Error('BLE_DIRECT_NOT_CONNECTED');
    }
    if (!record.length || record.length > MAX_RECORD_SIZE) {
      throw new Error('BLE_DIRECT_RECORD_SIZE');
    }
    this.frameId = this.frameId === 0xff ? 1 : this.frameId + 1;
    const capacity = this.packetSize - FRAGMENT_HEADER_SIZE;
    let offset = 0;
    let index = 0;
    while (offset < record.length) {
      const size = Math.min(capacity, record.length - offset);
      const flags = (offset === 0 ? 1 : 0) | (offset + size === record.length ? 2 : 0);
      const fragment = new Uint8Array(FRAGMENT_HEADER_SIZE + size);
      fragment.set([
        FRAGMENT_MAGIC,
        (FRAGMENT_VERSION << 4) | flags,
        this.frameId,
        index,
      ]);
      fragment.set(record.subarray(offset, offset + size), FRAGMENT_HEADER_SIZE);
      const write = this.writeWithoutResponse
        ? BleClient.writeWithoutResponse.bind(BleClient)
        : BleClient.write.bind(BleClient);
      await write(
        this.target.device.deviceId,
        BLINKER_BLE_SERVICE_UUID,
        BLINKER_BLE_RECEIVE_UUID,
        new DataView(fragment.buffer),
      );
      offset += size;
      index += 1;
      if (index > 0x100) throw new Error('BLE_DIRECT_FRAGMENT_COUNT');
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
): Promise<BleDirectTarget> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('BLE_DIRECT_SCAN_TIMEOUT_INVALID');
  }
  if (signal?.aborted) throw new Error('BLE_DIRECT_SCAN_CANCELLED');
  return new Promise<BleDirectTarget>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let abort = () => undefined;
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
    void BleClient.requestLEScan({
      services: [BLINKER_BLE_SERVICE_UUID],
      allowDuplicates: true,
      scanMode: ScanMode.SCAN_MODE_LOW_LATENCY,
    }, result => {
      if (deviceId && result.device.deviceId !== deviceId) return;
      if (excludedDeviceIds.has(result.device.deviceId)) return;
      const data = serviceData(result);
      if (!data) return;
      try {
        const profile = decodeBleModeProfile(data);
        if (profile.mode === mode) finish({ device: result.device, profile });
      } catch {
        // Ignore foreign or malformed advertisements; never connect to them.
      }
    }).catch(error => finish(undefined, error instanceof Error ? error : new Error(String(error))));
  });
}

function serviceData(result: ScanResult): DataView | undefined {
  if (!result.serviceData) return undefined;
  const match = Object.entries(result.serviceData).find(
    ([uuid]) => normalizeUuid(uuid) === BLINKER_BLE_SERVICE_UUID,
  );
  return match?.[1];
}

function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

function validateTarget(target: BleDirectTarget): void {
  if (!target?.device?.deviceId || !target.profile
    || (target.profile.mode !== BleApplicationMode.Provisioning
      && target.profile.mode !== BleApplicationMode.Direct)) {
    throw new Error('BLE_DIRECT_TARGET_INVALID');
  }
}
