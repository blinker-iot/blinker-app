import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { BlinkerDevice } from '../model/device.model';
import { DeviceV2EndpointKind, DeviceV2ValueType } from '../protocol/device-v2';
import { DeviceUiEndpoint, DeviceUiPort } from './device-ui.port';
import { canWriteDeviceEndpoint, deviceUiRange, EndpointCommandGate, validateDeviceUiControlValue } from './endpoint-control';

function endpoint(overrides: Partial<DeviceUiEndpoint> = {}): DeviceUiEndpoint {
  return { id: 1, key: 'level', manifestKind: DeviceV2EndpointKind.Property,
    manifestType: DeviceV2ValueType.SignedInteger, role: 'property', valueType: 'integer',
    readable: true, writable: true, notifies: true, minimum: 0, maximum: 100, step: 5,
    ...overrides };
}

function device(shared = false, access: Record<string, unknown> = {}): BlinkerDevice {
  return { config: { isShared: shared }, data: access } as BlinkerDevice;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('device endpoint write eligibility', () => {
  it('allows writable owned fields and rejects missing, disabled, preview and readonly devices', () => {
    const current = device();
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(true);
    expect(canWriteDeviceEndpoint(undefined, endpoint())).toBe(false);
    expect(canWriteDeviceEndpoint(current, endpoint({ writable: false }))).toBe(false);
    current.config.disabled = true;
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(false);
    current.config.disabled = false; current.config.isPreview = true;
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(false);
  });

  it('requires current explicit shared permission and either all endpoints or an exact list match', () => {
    const current = device(true);
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(false);
    current.data.canCommand = true;
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(false);
    current.data.commandEndpointKeys = null;
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(true);
    current.data.commandEndpointKeys = ['other'];
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(false);
    current.data.commandEndpointKeys = ['level'];
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(true);
    current.data.canCommand = 1;
    expect(canWriteDeviceEndpoint(current, endpoint())).toBe(false);
  });

  it('does not treat malformed endpoint filters as grants', () => {
    expect(canWriteDeviceEndpoint(device(true, { canCommand: true, commandEndpointKeys: 'level' }), endpoint())).toBe(false);
    expect(canWriteDeviceEndpoint(device(true, { canCommand: true, commandEndpointKeys: [] }), endpoint())).toBe(false);
  });
});

describe('explicit device slider ranges', () => {
  it.each([DeviceV2ValueType.SignedInteger, DeviceV2ValueType.UnsignedInteger,
    DeviceV2ValueType.Float32, DeviceV2ValueType.Float64])('accepts a supported numeric range: %s', type => {
    expect(deviceUiRange(endpoint({ manifestType: type }))).toEqual({ minimum: 0, maximum: 100, step: 5 });
  });

  it.each([
    { readable: false }, { writable: false }, { role: 'action' },
    { manifestKind: DeviceV2EndpointKind.Action }, { manifestType: undefined },
    { manifestType: DeviceV2ValueType.Boolean }, { minimum: undefined },
    { maximum: undefined }, { step: undefined }, { minimum: NaN }, { maximum: Infinity },
    { step: NaN }, { minimum: 100 }, { maximum: -1 }, { step: 0 }, { step: -1 },
    { minimum: 0.5 }, { maximum: 99.5 }, { step: 0.5 }, { maximum: Number.MAX_SAFE_INTEGER + 1 },
    { minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
    { manifestType: DeviceV2ValueType.UnsignedInteger, minimum: -1 },
    { manifestType: DeviceV2ValueType.Float64, minimum: 1e20, maximum: 1e21, step: 1 },
  ] as Partial<DeviceUiEndpoint>[])('does not invent or expose an unsupported range: %j', overrides => {
    expect(deviceUiRange(endpoint(overrides))).toBeUndefined();
  });

  it('allows representable fractional ranges without making integers fractional', () => {
    expect(deviceUiRange(endpoint({ manifestType: DeviceV2ValueType.Float64, minimum: -1.5,
      maximum: 2.5, step: 0.1 }))).toEqual({ minimum: -1.5, maximum: 2.5, step: 0.1 });
  });
});

describe('device control value preflight', () => {
  it('preserves zero and validates exact integer offsets, including negative minima', () => {
    const field = endpoint({ minimum: -7, maximum: 8, step: 5 });
    for (const value of [-7, -2, 3, 8, 3n]) expect(() => validateDeviceUiControlValue(field, value)).not.toThrow();
    expect(() => validateDeviceUiControlValue(endpoint(), 0)).not.toThrow();
    expect(() => validateDeviceUiControlValue(field, 0)).toThrow('DEVICE_UI_STEP_MISMATCH');
    expect(() => validateDeviceUiControlValue(field, 0n)).toThrow('DEVICE_UI_STEP_MISMATCH');
  });

  it('uses exact BigInt integer step modulo near safe number boundaries', () => {
    const field = endpoint({ minimum: Number.MAX_SAFE_INTEGER - 20,
      maximum: Number.MAX_SAFE_INTEGER, step: 5 });
    expect(() => validateDeviceUiControlValue(field, Number.MAX_SAFE_INTEGER - 5)).not.toThrow();
    expect(() => validateDeviceUiControlValue(field, Number.MAX_SAFE_INTEGER - 4)).toThrow('DEVICE_UI_STEP_MISMATCH');
  });

  it.each(['', '0', undefined, null, NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'does not coerce invalid integer input: %j', value => {
      expect(() => validateDeviceUiControlValue(endpoint(), value)).toThrow();
    });

  it('retains codec range and unsigned validation', () => {
    expect(() => validateDeviceUiControlValue(endpoint(), -5)).toThrow();
    expect(() => validateDeviceUiControlValue(endpoint(), 105)).toThrow();
    expect(() => validateDeviceUiControlValue(endpoint({ manifestType: DeviceV2ValueType.UnsignedInteger }), -1)).toThrow();
  });

  it('tolerates tiny floating error but rejects a half step and nonfinite input', () => {
    const field = endpoint({ manifestType: DeviceV2ValueType.Float64, minimum: 0, maximum: 1, step: 0.1 });
    expect(() => validateDeviceUiControlValue(field, 0.1 + 0.2)).not.toThrow();
    expect(() => validateDeviceUiControlValue(field, 0.35)).toThrow('DEVICE_UI_STEP_MISMATCH');
    expect(() => validateDeviceUiControlValue(field, 0.300001)).toThrow('DEVICE_UI_STEP_MISMATCH');
    expect(() => validateDeviceUiControlValue(field, NaN)).toThrow();
    expect(() => validateDeviceUiControlValue(field, Infinity)).toThrow();
  });

  it('does not let a large float step tolerance accept a half step', () => {
    const field = endpoint({ manifestType: DeviceV2ValueType.Float64, minimum: 0, maximum: 1e10, step: 0.01 });
    expect(() => validateDeviceUiControlValue(field, 1e9)).not.toThrow();
    expect(() => validateDeviceUiControlValue(field, 1e9 + 0.005)).toThrow('DEVICE_UI_STEP_MISMATCH');
  });

  it('uses original codec types for booleans and supported button payloads', () => {
    const boolean = endpoint({ manifestType: DeviceV2ValueType.Boolean, minimum: undefined, maximum: undefined, step: undefined });
    expect(() => validateDeviceUiControlValue(boolean, false)).not.toThrow();
    expect(() => validateDeviceUiControlValue(boolean, 'false')).toThrow();
    const button = endpoint({ manifestKind: DeviceV2EndpointKind.Action, role: 'action',
      manifestType: DeviceV2ValueType.Null, readable: false, minimum: undefined, maximum: undefined, step: undefined });
    expect(() => validateDeviceUiControlValue(button, null)).not.toThrow();
    expect(() => validateDeviceUiControlValue(button, true)).toThrow();
  });

  it('does not guess Manifest identities or accept event/readonly commands', () => {
    expect(() => validateDeviceUiControlValue(endpoint({ manifestType: undefined }), 0)).toThrow('DEVICE_UI_MANIFEST_REQUIRED');
    expect(() => validateDeviceUiControlValue(endpoint({ manifestKind: undefined }), 0)).toThrow('DEVICE_UI_MANIFEST_REQUIRED');
    expect(() => validateDeviceUiControlValue(endpoint({ id: 0 }), 0)).toThrow('DEVICE_UI_MANIFEST_REQUIRED');
    expect(() => validateDeviceUiControlValue(endpoint({ writable: false }), 0)).toThrow();
    expect(() => validateDeviceUiControlValue(endpoint({ manifestKind: DeviceV2EndpointKind.Event, role: 'event' }), 0)).toThrow();
  });
});

describe('shared per-endpoint command gate', () => {
  it('rejects a second pending command immediately without queueing or retrying it', async () => {
    const gate = new EndpointCommandGate(); const pending = deferred(); const work = vi.fn(() => pending.promise);
    const first = gate.run('account/device/power', work);
    await expect(gate.run('account/device/power', work)).rejects.toThrow('DEVICE_UI_COMMAND_PENDING');
    expect(work).toHaveBeenCalledOnce();
    pending.resolve(); await first;
    await gate.run('account/device/power', async () => undefined);
  });

  it('does not conflict between accounts or endpoints and never clears a successor on old failure', async () => {
    const gate = new EndpointCommandGate(); const first = deferred();
    const old = gate.run('account-a/device/power', () => first.promise);
    await gate.run('account-b/device/power', async () => undefined);
    await gate.run('account-a/device/level', async () => undefined);
    const failed = expect(old).rejects.toThrow('unknown');
    first.reject(Error('unknown')); await failed;
    const next = deferred(); const current = gate.run('account-a/device/power', () => next.promise);
    await expect(gate.run('account-a/device/power', async () => undefined)).rejects.toThrow('DEVICE_UI_COMMAND_PENDING');
    next.resolve(); await current;
  });

  it('bounds simultaneous work to sixteen keys and releases failed or synchronously thrown work', async () => {
    const gate = new EndpointCommandGate(); const pending = deferred();
    const current = Array.from({ length: 16 }, (_, i) => gate.run(String(i), () => pending.promise));
    const rejected = vi.fn(async () => undefined);
    await expect(gate.run('extra', rejected)).rejects.toThrow('DEVICE_UI_COMMAND_CAPACITY');
    expect(rejected).not.toHaveBeenCalled();
    pending.resolve(); await Promise.all(current);
    await expect(gate.run('extra', () => { throw Error('sync'); })).rejects.toThrow('sync');
    await gate.run('extra', async () => undefined);
  });

  it('shares the guard at DeviceUiPort while keeping account/session scope distinct', async () => {
    const pending = deferred();
    const data = { auth: { uuid: 'account-a' }, sessionEpoch: 1,
      getDevice: () => ({ cloudEnabled: true }) };
    const service = { command: vi.fn(() => pending.promise) };
    const port = new DeviceUiPort(service as any, {} as any, {} as any,
      { active: new BehaviorSubject(true) } as any, data as any);
    const first = port.sendCommand('device', 'power', true);
    await expect(port.sendCommand('device', 'power', false)).rejects.toThrow('DEVICE_UI_COMMAND_PENDING');
    data.auth.uuid = 'account-b';
    const second = port.sendCommand('device', 'power', false);
    data.sessionEpoch += 1;
    const third = port.sendCommand('device', 'power', false);
    expect(service.command).toHaveBeenCalledTimes(3);
    pending.resolve(); await Promise.all([first, second, third]);
  });
});
