import { describe, expect, it, vi } from 'vitest';

import {
  DeviceV2EndpointKind,
  DeviceV2TelemetryManager,
  DeviceV2TelemetryOperation,
  DeviceV2TelemetryStatusCode,
  DeviceV2ValueType,
} from './index';

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
});
