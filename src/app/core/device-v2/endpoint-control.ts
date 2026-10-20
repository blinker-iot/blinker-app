import type { BlinkerDevice } from '../model/device.model';
import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2ValueType,
  encodeCommandBody,
} from '../protocol/device-v2';
import type { DeviceUiEndpoint } from './device-ui.port';

/** UI eligibility only. The existing transport remains the authoritative ACL. */
export function canWriteDeviceEndpoint(device: BlinkerDevice | undefined, field: DeviceUiEndpoint): boolean {
  if (!device || device.config.disabled || device.config.isPreview || !field.writable) return false;
  if (!device.config.isShared) return true;

  return device.data?.canCommand === true && (device.data.commandEndpointKeys === null
    || Array.isArray(device.data.commandEndpointKeys) && device.data.commandEndpointKeys.includes(field.key));
}

export interface DeviceUiRange {
  minimum: number;
  maximum: number;
  step: number;
}

function integerType(field: DeviceUiEndpoint): boolean {
  return field.manifestType === DeviceV2ValueType.SignedInteger
    || field.manifestType === DeviceV2ValueType.UnsignedInteger;
}

/** A slider needs an explicit, representable Manifest range; never invent one. */
export function deviceUiRange(field: DeviceUiEndpoint): DeviceUiRange | undefined {
  if (field.manifestKind !== DeviceV2EndpointKind.Property || field.role !== 'property'
    || !field.readable || !field.writable
    || ![DeviceV2ValueType.SignedInteger, DeviceV2ValueType.UnsignedInteger,
      DeviceV2ValueType.Float32, DeviceV2ValueType.Float64].includes(field.manifestType)) return undefined;

  const { minimum, maximum, step } = field;
  if (![minimum, maximum, step].every(value => typeof value === 'number' && Number.isFinite(value))
    || maximum <= minimum || step <= 0 || !Number.isFinite(maximum - minimum)) return undefined;

  if (integerType(field)) {
    if (![minimum, maximum, step, maximum - minimum].every(Number.isSafeInteger)
      || field.manifestType === DeviceV2ValueType.UnsignedInteger && minimum < 0) return undefined;
  } else if (minimum + step <= minimum || maximum - step >= maximum) return undefined;

  return { minimum, maximum, step };
}

/** Preflight with the original codec; dispatch still validates against its live Manifest. */
export function validateDeviceUiControlValue(field: DeviceUiEndpoint, value: unknown): void {
  if (field.manifestKind === undefined || field.manifestType === undefined
    || !Number.isInteger(field.id) || field.id <= 0 || field.id > 0xffff) {
    throw new Error('DEVICE_UI_MANIFEST_REQUIRED');
  }
  encodeCommandBody({
    id: field.id,
    key: field.key,
    kind: field.manifestKind,
    type: field.manifestType,
    access: (field.readable ? DeviceV2EndpointAccess.Read : 0)
      | (field.writable ? field.manifestKind === DeviceV2EndpointKind.Action
        ? DeviceV2EndpointAccess.Command : DeviceV2EndpointAccess.Write : 0),
    constraints: { minimum: field.minimum, maximum: field.maximum, step: field.step,
      maxLength: field.maxLength, enumValues: field.choices },
  }, value);

  const range = deviceUiRange(field);
  if (!range) return;

  if (integerType(field)) {
    // BigInt keeps offset/modulo exact even when two safe integers have a wide offset.
    const integer = BigInt(value as number | bigint);
    if ((integer - BigInt(range.minimum)) % BigInt(range.step) !== 0n) {
      throw new Error('DEVICE_UI_STEP_MISMATCH');
    }
  } else {
    const position = ((value as number) - range.minimum) / range.step;
    // A tiny rounding allowance, capped well below a half step at any magnitude.
    const tolerance = Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(position)) * 8);
    if (!Number.isFinite(position) || Math.abs(position - Math.round(position)) > tolerance) {
      throw new Error('DEVICE_UI_STEP_MISMATCH');
    }
  }
}

/** Shared per-endpoint pending guard, with no queue, retries or persisted commands. */
export class EndpointCommandGate {
  private readonly pending = new Set<string>();

  async run(key: string, work: () => Promise<void>): Promise<void> {
    if (this.pending.has(key)) throw new Error('DEVICE_UI_COMMAND_PENDING');
    if (this.pending.size >= 16) throw new Error('DEVICE_UI_COMMAND_CAPACITY');
    this.pending.add(key);

    try { await work(); } finally { this.pending.delete(key); }
  }
}
