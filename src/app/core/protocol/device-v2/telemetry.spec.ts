import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DeviceV2EndpointKind,
  DeviceV2TelemetryManager,
  DeviceV2TelemetryOperation,
  DeviceV2TelemetrySnapshot,
  DeviceV2TelemetryStatusCode,
  DeviceV2ValueType,
} from './index';

type SendTelemetry = ConstructorParameters<typeof DeviceV2TelemetryManager>[1];

function createFixture(send?: SendTelemetry) {
  const clock = { wall: 100000, monotonic: 100 };
  const controls: Parameters<SendTelemetry>[1][] = [];
  const error = vi.fn();
  let epoch = 0;
  const manager = new DeviceV2TelemetryManager(
    async () => [{
      key: 'temperature',
      kind: DeviceV2EndpointKind.Property,
      type: DeviceV2ValueType.Float32,
      access: 5,
      id: 1,
      telemetryMinimumIntervalMs: 1000,
    }],
    async (deviceId, control) => {
      controls.push(control);
      if (send) return send(deviceId, control);
      return {
        streamId: control.streamId,
        epoch: control.operation === DeviceV2TelemetryOperation.Open ? ++epoch : control.epoch,
        status: control.operation === DeviceV2TelemetryOperation.Open
          ? DeviceV2TelemetryStatusCode.Opened
          : control.operation === DeviceV2TelemetryOperation.Renew
            ? DeviceV2TelemetryStatusCode.Renewed : DeviceV2TelemetryStatusCode.Closed,
        effectiveIntervalMs: 1000,
        leaseMs: control.operation === DeviceV2TelemetryOperation.Close ? 0 : control.leaseMs,
      };
    },
    error,
    { wallNow: () => clock.wall, monotonicNow: () => clock.monotonic },
  );
  return { manager, clock, controls, error };
}

function sample(snapshot: Pick<DeviceV2TelemetrySnapshot, 'streamId' | 'epoch'>, sequence: number) {
  return {
    streamId: snapshot.streamId,
    epoch: snapshot.epoch,
    sampleSequence: sequence,
    monotonicMs: 10,
    values: {
      temperature: {
        type: DeviceV2ValueType.Float32,
        value: 21.5,
        cbor: new Uint8Array([0xfa, 0x41, 0xac, 0x00, 0x00]),
      },
    },
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('Device V2 telemetry lifecycle', () => {
  it('opens, renews, stores samples and closes with page visibility', async () => {
    vi.useFakeTimers();
    const controls: Array<{ operation: DeviceV2TelemetryOperation; streamId: number }> = [];
    let epoch = 7;
    const manager = new DeviceV2TelemetryManager(
      async () => [{
        key: 'temperature',
        kind: DeviceV2EndpointKind.Property,
        type: DeviceV2ValueType.Float32,
        access: 5,
        id: 1,
        telemetryMinimumIntervalMs: 1000,
      }],
      async (_logicalDeviceId, control) => {
        controls.push(control);
        if (control.operation === DeviceV2TelemetryOperation.Open) {
          return {
            streamId: control.streamId,
            epoch,
            status: DeviceV2TelemetryStatusCode.Opened,
            effectiveIntervalMs: 1000,
            leaseMs: control.leaseMs,
          };
        }
        return {
          streamId: control.streamId,
          epoch: control.epoch,
          status: control.operation === DeviceV2TelemetryOperation.Renew
            ? DeviceV2TelemetryStatusCode.Renewed
            : DeviceV2TelemetryStatusCode.Closed,
          effectiveIntervalMs: 1000,
          leaseMs: control.operation === DeviceV2TelemetryOperation.Close ? 0 : control.leaseMs,
        };
      },
      error => { throw error; },
    );

    const lease = await manager.open('device_test', ['temperature'], 200, { leaseMs: 30000 });
    expect(lease.snapshot).toMatchObject({ active: true, visible: true, epoch: 7 });
    manager.receiveData('device_test', {
      streamId: lease.snapshot.streamId,
      epoch: 7,
      sampleSequence: 1,
      monotonicMs: 10,
      values: {
        temperature: {
          type: DeviceV2ValueType.Float32,
          value: 21.5,
          cbor: new Uint8Array([0xfa, 0x41, 0xac, 0x00, 0x00]),
        },
      },
    });
    expect(lease.snapshot.values['temperature']?.value).toBe(21.5);

    await vi.advanceTimersByTimeAsync(10000);
    expect(controls.map(control => control.operation)).toEqual([
      DeviceV2TelemetryOperation.Open,
      DeviceV2TelemetryOperation.Renew,
    ]);
    await lease.setVisible(false);
    expect(lease.snapshot).toMatchObject({ active: false, visible: false });
    expect(lease.snapshot.values).toEqual({});
    epoch += 1;
    await lease.setVisible(true);
    expect(lease.snapshot).toMatchObject({ active: true, visible: true, epoch: 8 });
    await lease.close();
    vi.useRealTimers();
  });

  it('serializes Close and Open when visibility changes while a control is in flight', async () => {
    vi.useFakeTimers();
    let epoch = 1;
    let openCount = 0;
    let closeInFlight = false;
    let overlap = false;
    let finishClose: (() => void) | undefined;
    const manager = new DeviceV2TelemetryManager(
      async () => [{
        key: 'temperature',
        kind: DeviceV2EndpointKind.Property,
        type: DeviceV2ValueType.Float32,
        access: 5,
        id: 1,
        telemetryMinimumIntervalMs: 1000,
      }],
      async (_logicalDeviceId, control) => {
        if (control.operation === DeviceV2TelemetryOperation.Open) {
          if (closeInFlight) overlap = true;
          openCount += 1;
          return {
            streamId: control.streamId,
            epoch: epoch++,
            status: DeviceV2TelemetryStatusCode.Opened,
            effectiveIntervalMs: 1000,
            leaseMs: control.leaseMs,
          };
        }
        if (control.operation === DeviceV2TelemetryOperation.Close) {
          closeInFlight = true;
          return new Promise(resolve => {
            finishClose = () => {
              closeInFlight = false;
              resolve({
                streamId: control.streamId,
                epoch: control.epoch,
                status: DeviceV2TelemetryStatusCode.Closed,
                effectiveIntervalMs: 1000,
                leaseMs: 0,
              });
            };
          });
        }
        throw new Error('unexpected telemetry control');
      },
      error => { throw error; },
    );

    const lease = await manager.open('device_test', ['temperature'], 1000);
    const closing = lease.setVisible(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(finishClose).toBeTypeOf('function');
    const opening = lease.setVisible(true);
    expect(openCount).toBe(1);
    finishClose!();
    await Promise.all([closing, opening]);
    expect(overlap).toBe(false);
    expect(openCount).toBe(2);

    manager.reset();
    vi.useRealTimers();
  });

  it('exposes confirmed interval and receipt metadata without treating device uptime as UTC', async () => {
    vi.useFakeTimers();
    const { manager, clock } = createFixture();
    const lease = await manager.open('device_test', ['temperature'], 200);
    expect(lease.snapshot).toMatchObject({
      effectiveIntervalMs: 1000,
      sampleSequence: undefined,
      sampleMonotonicMs: undefined,
      receivedAtMs: undefined,
      receivedMonotonicMs: undefined,
      missedSamples: 0,
    });
    manager.receiveData('device_test', sample(lease.snapshot, 5));
    expect(lease.snapshot).toMatchObject({
      sampleSequence: 5,
      sampleMonotonicMs: 10,
      receivedAtMs: 100000,
      receivedMonotonicMs: 100,
      missedSamples: 0,
    });
    clock.wall = 50000; // Changing the phone clock must not change monotonic freshness.
    clock.monotonic = 1100;
    manager.receiveData('device_test', sample(lease.snapshot, 7));
    expect(lease.snapshot).toMatchObject({
      sampleSequence: 7,
      receivedAtMs: 50000,
      receivedMonotonicMs: 1100,
      missedSamples: 1,
    });
    manager.reset();
  });

  it('rejects old/duplicate samples without refreshing receipt time and handles reserved-zero wrap', async () => {
    vi.useFakeTimers();
    const { manager, clock } = createFixture();
    const lease = await manager.open('device_test', ['temperature'], 1000);
    manager.receiveData('device_test', sample(lease.snapshot, 0xfffffffe));
    manager.receiveData('device_test', sample(lease.snapshot, 0xffffffff));
    manager.receiveData('device_test', sample(lease.snapshot, 1));
    expect(lease.snapshot.missedSamples).toBe(0);
    manager.receiveData('device_test', sample(lease.snapshot, 4));
    expect(lease.snapshot.missedSamples).toBe(2);
    const current = lease.snapshot;
    clock.wall += 9000;
    clock.monotonic += 9000;
    for (const sequence of [4, 3, 0xffffffff, 0x80000004]) {
      manager.receiveData('device_test', sample(lease.snapshot, sequence));
      expect(lease.snapshot).toEqual(current);
    }
    manager.reset();
  });

  it('clears samples immediately when hidden and ignores late data while Close is pending', async () => {
    vi.useFakeTimers();
    let finishClose: (() => void) | undefined;
    let epoch = 0;
    const { manager } = createFixture(async (_deviceId, control) => {
      if (control.operation === DeviceV2TelemetryOperation.Open) {
        return {
          streamId: control.streamId, epoch: ++epoch,
          status: DeviceV2TelemetryStatusCode.Opened, effectiveIntervalMs: 1000,
          leaseMs: control.leaseMs,
        };
      }
      return new Promise(resolve => {
        finishClose = () => resolve({
          streamId: control.streamId, epoch: control.epoch,
          status: DeviceV2TelemetryStatusCode.Closed, effectiveIntervalMs: 1000, leaseMs: 0,
        });
      });
    });
    const lease = await manager.open('device_test', ['temperature'], 1000);
    const previous = lease.snapshot;
    manager.receiveData('device_test', sample(previous, 1));
    const hiding = lease.setVisible(false);
    expect(lease.snapshot).toMatchObject({
      visible: false, receivedAtMs: undefined, sampleSequence: undefined, values: {},
    });
    manager.receiveData('device_test', sample(previous, 2));
    expect(lease.snapshot.values).toEqual({});
    await Promise.resolve();
    finishClose!();
    await hiding;
    await lease.setVisible(true);
    manager.receiveData('device_test', sample(previous, 3));
    expect(lease.snapshot.sampleSequence).toBeUndefined();
    manager.receiveData('device_test', sample(lease.snapshot, 1));
    expect(lease.snapshot.sampleSequence).toBe(1);
    manager.reset();
  });

  it('locally retires a closing stream even when remote Close fails', async () => {
    vi.useFakeTimers();
    const { manager } = createFixture(async (_deviceId, control) => {
      if (control.operation !== DeviceV2TelemetryOperation.Open) throw new Error('offline');
      return {
        streamId: control.streamId, epoch: 1,
        status: DeviceV2TelemetryStatusCode.Opened, effectiveIntervalMs: 1000,
        leaseMs: control.leaseMs,
      };
    });
    const lease = await manager.open('device_test', ['temperature'], 1000);
    const previous = lease.snapshot;
    manager.receiveData('device_test', sample(previous, 1));
    const updates: DeviceV2TelemetrySnapshot[] = [];
    lease.subscribe(snapshot => updates.push(snapshot));
    await expect(lease.close()).rejects.toThrow('offline');
    expect(updates.at(-1)).toMatchObject({
      active: false, visible: false, sampleSequence: undefined,
      receivedMonotonicMs: undefined, missedSamples: 0, values: {},
    });
    manager.receiveData('device_test', sample(previous, 2));
    expect(lease.snapshot.values).toEqual({});
    await vi.advanceTimersByTimeAsync(30000);
    await lease.close();
  });

  it('reset notifies subscribers before removing them and does not accept hidden or inactive data', async () => {
    vi.useFakeTimers();
    const { manager, controls } = createFixture();
    const lease = await manager.open('device_test', ['temperature'], 1000);
    const previous = lease.snapshot;
    const updates: DeviceV2TelemetrySnapshot[] = [];
    lease.subscribe(snapshot => updates.push(snapshot));
    manager.receiveData('device_test', sample(previous, 1));
    manager.reset();
    expect(updates.at(-1)).toMatchObject({
      active: false, visible: false, sampleSequence: undefined,
      sampleMonotonicMs: undefined, receivedAtMs: undefined,
      receivedMonotonicMs: undefined, missedSamples: 0, values: {},
    });
    const updateCount = updates.length;
    manager.receiveData('device_test', sample(previous, 2));
    await vi.advanceTimersByTimeAsync(30000);
    expect(updates).toHaveLength(updateCount);
    expect(controls).toHaveLength(1);
    const hidden = await manager.open('device_test', ['temperature'], 1000, { visible: false });
    manager.receiveData('device_test', sample(hidden.snapshot, 1));
    expect(hidden.snapshot.sampleSequence).toBeUndefined();
    manager.reset();
  });

  it('rejects an Open that finishes after manager reset without scheduling renewals', async () => {
    vi.useFakeTimers();
    let finishOpen: (() => void) | undefined;
    const { manager, controls } = createFixture(async (_deviceId, control) => new Promise(resolve => {
      finishOpen = () => resolve({
        streamId: control.streamId, epoch: 1,
        status: DeviceV2TelemetryStatusCode.Opened, effectiveIntervalMs: 1000, leaseMs: 30000,
      });
    }));
    const opening = manager.open('device_test', ['temperature'], 1000);
    await Promise.resolve();
    manager.reset();
    const failure = expect(opening).rejects.toThrow('lease is closed');
    finishOpen!();
    await failure;
    await vi.advanceTimersByTimeAsync(30000);
    expect(controls).toHaveLength(1);
  });

  it('optionally closes active reset leases without reviving failed controls or hidden leases', async () => {
    vi.useFakeTimers();
    const { manager, controls, error } = createFixture(async (_deviceId, control) => {
      if (control.operation === DeviceV2TelemetryOperation.Close) throw Error('Close rejected');
      return { streamId: control.streamId, epoch: 7, status: DeviceV2TelemetryStatusCode.Opened,
        effectiveIntervalMs: 1000, leaseMs: 30000 };
    });
    const lease = await manager.open('device_test', ['temperature'], 1000);
    await manager.open('device_test', ['temperature'], 1000, { visible: false });
    const previous = lease.snapshot;
    expect(manager.fieldsForData('device_test', previous.streamId, previous.epoch)?.[0].key).toBe('temperature');
    manager.reset(true);
    expect(manager.fieldsForData('device_test', previous.streamId, previous.epoch)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(30000);
    expect(controls).toHaveLength(2);
    expect(controls[1]).toEqual({ operation: DeviceV2TelemetryOperation.Close,
      streamId: previous.streamId, epoch: previous.epoch });
    expect(error).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(lease.snapshot).toMatchObject({ active: false, visible: false, values: {} });
  });

  it('optionally sends Close for a valid Open arriving after reset and never schedules renewal', async () => {
    vi.useFakeTimers();
    let finishOpen!: () => void;
    const { manager, controls } = createFixture(async (_deviceId, control) => {
      if (control.operation === DeviceV2TelemetryOperation.Open) return new Promise(resolve => {
        finishOpen = () => resolve({ streamId: control.streamId, epoch: 7,
          status: DeviceV2TelemetryStatusCode.Opened, effectiveIntervalMs: 1000, leaseMs: 30000 });
      });
      return { streamId: control.streamId, epoch: control.epoch,
        status: DeviceV2TelemetryStatusCode.Closed, effectiveIntervalMs: 1000, leaseMs: 0 };
    });
    const opening = manager.open('device_test', ['temperature'], 1000);
    await Promise.resolve(); manager.reset(true);
    const rejected = expect(opening).rejects.toThrow('lease is closed');
    finishOpen(); await rejected; await vi.advanceTimersByTimeAsync(30000);
    expect(controls).toHaveLength(2);
    expect(controls[1]).toEqual({ operation: DeviceV2TelemetryOperation.Close,
      streamId: controls[0].streamId, epoch: 7 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes confirmed interval changes but does not refresh a sample on status or renewal', async () => {
    vi.useFakeTimers();
    const { manager, clock } = createFixture();
    const lease = await manager.open('device_test', ['temperature'], 1000);
    manager.receiveData('device_test', sample(lease.snapshot, 1));
    const listener = vi.fn();
    lease.subscribe(listener);
    clock.wall += 10000;
    clock.monotonic += 10000;
    const status = {
      streamId: lease.snapshot.streamId, epoch: lease.snapshot.epoch,
      status: DeviceV2TelemetryStatusCode.Renewed, effectiveIntervalMs: 5000, leaseMs: 30000,
    };
    manager.receiveStatus('device_test', status);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
      effectiveIntervalMs: 5000, receivedAtMs: 100000, receivedMonotonicMs: 100,
    });
    expect(listener).toHaveBeenCalledTimes(2);
    for (const invalid of [
      { ...status, streamId: status.streamId + 1 },
      { ...status, epoch: status.epoch + 1 },
      { ...status, status: 255 as DeviceV2TelemetryStatusCode },
    ]) manager.receiveStatus('device_test', invalid);
    manager.receiveStatus('other_device', status);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(lease.snapshot.effectiveIntervalMs).toBe(5000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
      effectiveIntervalMs: 1000, receivedAtMs: 100000, receivedMonotonicMs: 100,
    });
    manager.reset();
    const afterReset = lease.snapshot;
    manager.receiveStatus('device_test', status);
    expect(lease.snapshot).toEqual(afterReset);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('ignores a renewal confirmation finishing after reset instead of notifying or scheduling again', async () => {
    vi.useFakeTimers();
    let finishRenew: (() => void) | undefined;
    const { manager, controls } = createFixture(async (_deviceId, control) => {
      if (control.operation === DeviceV2TelemetryOperation.Open) {
        return {
          streamId: control.streamId, epoch: 1,
          status: DeviceV2TelemetryStatusCode.Opened, effectiveIntervalMs: 1000,
          leaseMs: control.leaseMs,
        };
      }
      return new Promise(resolve => {
        finishRenew = () => resolve({
          streamId: control.streamId, epoch: control.epoch,
          status: DeviceV2TelemetryStatusCode.Renewed, effectiveIntervalMs: 5000, leaseMs: 30000,
        });
      });
    });
    const lease = await manager.open('device_test', ['temperature'], 1000);
    const listener = vi.fn();
    lease.subscribe(listener);
    manager.receiveData('device_test', sample(lease.snapshot, 1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(finishRenew).toBeTypeOf('function');
    manager.reset();
    const afterReset = lease.snapshot;
    const updateCount = listener.mock.calls.length;
    finishRenew!();
    await vi.advanceTimersByTimeAsync(30000);
    expect(lease.snapshot).toEqual(afterReset);
    expect(listener).toHaveBeenCalledTimes(updateCount);
    expect(controls).toHaveLength(2);
  });

  it('a failed renewal clears sample metadata and publishes an inactive snapshot', async () => {
    vi.useFakeTimers();
    const { manager, error } = createFixture(async (_deviceId, control) => {
      if (control.operation !== DeviceV2TelemetryOperation.Open) throw new Error('renew failed');
      return {
        streamId: control.streamId, epoch: 1,
        status: DeviceV2TelemetryStatusCode.Opened, effectiveIntervalMs: 1000,
        leaseMs: control.leaseMs,
      };
    });
    const lease = await manager.open('device_test', ['temperature'], 1000);
    manager.receiveData('device_test', sample(lease.snapshot, 1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(error).toHaveBeenCalledTimes(1);
    expect(lease.snapshot).toMatchObject({
      active: false, sampleSequence: undefined, receivedAtMs: undefined, values: {},
    });
    manager.receiveData('device_test', sample(lease.snapshot, 2));
    expect(lease.snapshot.sampleSequence).toBeUndefined();
    manager.reset();
  });
});
