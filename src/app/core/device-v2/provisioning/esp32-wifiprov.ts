const VERSION = 2;
const DEVICE_KEY_TEXT_BYTES = 43;
const DEVICE_INSTANCE_ID_BYTES = 16;
const CONTROLLER_ID_BYTES = 16;
const CONTROLLER_SECRET_BYTES = 32;

export const BLINKER_CONFIG_ENDPOINT = 'blinker-config/2';

export enum BlinkerConfigOperation {
  GetInfo = 1,
  Install = 2,
  Bootstrap = 3,
}

export enum BlinkerConfigStatus {
  Success = 0,
  Malformed = 1,
  UnsupportedVersion = 2,
  UnsupportedOperation = 3,
  InvalidDeviceKey = 4,
  StorageFailure = 5,
  Conflict = 6,
  InvalidController = 7,
  AccessRequired = 8,
}

export interface BlinkerConfigInfo {
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  hasDeviceKey: boolean;
  supportsAccessBootstrap: boolean;
  hasAccessState: boolean;
}

export interface BlinkerAccessBootstrap {
  accessEpoch: number;
  controllerId: Uint8Array;
  credentialVersion: number;
  controllerSecret: Uint8Array;
}

export interface Esp32ProvisioningTransport {
  request(endpoint: string, payload: Uint8Array): Promise<Uint8Array>;
}

export class BlinkerConfigError extends Error {
  constructor(
    message: string,
    readonly status?: BlinkerConfigStatus,
  ) {
    super(message);
    this.name = 'BlinkerConfigError';
  }
}

export function encodeBlinkerConfigInfoRequest(): Uint8Array {
  return Uint8Array.of(VERSION, BlinkerConfigOperation.GetInfo);
}

export function encodeBlinkerConfigInstall(deviceKey: string): Uint8Array {
  const key = strictDeviceKeyText(deviceKey);
  const request = new Uint8Array(2 + DEVICE_KEY_TEXT_BYTES);
  request.set([VERSION, BlinkerConfigOperation.Install]);
  request.set(key, 2);
  return request;
}

export function encodeBlinkerConfigBootstrap(
  deviceKey: string,
  bootstrap: BlinkerAccessBootstrap,
): Uint8Array {
  const key = strictDeviceKeyText(deviceKey);
  const controllerId = exactNonZeroBytes(
    bootstrap.controllerId,
    CONTROLLER_ID_BYTES,
    'controller id',
  );
  const controllerSecret = exactNonZeroBytes(
    bootstrap.controllerSecret,
    CONTROLLER_SECRET_BYTES,
    'controller secret',
  );
  const request = new Uint8Array(
    2
      + DEVICE_KEY_TEXT_BYTES
      + 4
      + CONTROLLER_ID_BYTES
      + 4
      + CONTROLLER_SECRET_BYTES,
  );

  request.set([VERSION, BlinkerConfigOperation.Bootstrap]);
  request.set(key, 2);
  let offset = 2 + DEVICE_KEY_TEXT_BYTES;
  writeU32(request, offset, strictU32(bootstrap.accessEpoch, 'access epoch'));
  offset += 4;
  request.set(controllerId, offset);
  offset += CONTROLLER_ID_BYTES;
  writeU32(
    request,
    offset,
    strictU32(bootstrap.credentialVersion, 'credential version'),
  );
  offset += 4;
  request.set(controllerSecret, offset);
  return request;
}

export function decodeBlinkerConfigInfo(response: Uint8Array): BlinkerConfigInfo {
  validateResponseHeader(response, BlinkerConfigOperation.GetInfo);
  if (response.length !== 4 + DEVICE_INSTANCE_ID_BYTES + 4) {
    throw new BlinkerConfigError('Blinker config info response has an invalid size');
  }
  const flags = response[3];
  if ((flags & ~0x07) !== 0) {
    throw new BlinkerConfigError('Blinker config info contains unknown flags');
  }
  return {
    deviceInstanceId: response.slice(4, 4 + DEVICE_INSTANCE_ID_BYTES),
    accessEpoch: readU32(response, 4 + DEVICE_INSTANCE_ID_BYTES),
    hasDeviceKey: (flags & 0x01) !== 0,
    supportsAccessBootstrap: (flags & 0x02) !== 0,
    hasAccessState: (flags & 0x04) !== 0,
  };
}

export function decodeBlinkerConfigStatus(
  response: Uint8Array,
  operation: BlinkerConfigOperation.Install | BlinkerConfigOperation.Bootstrap,
): void {
  validateResponseHeader(response, operation);
  if (response.length !== 3) {
    throw new BlinkerConfigError('Blinker config status response has an invalid size');
  }
}

export async function configureBlinkerAccess(
  transport: Esp32ProvisioningTransport,
  deviceKey: string,
  bootstrap?: BlinkerAccessBootstrap,
): Promise<{
  info: BlinkerConfigInfo;
  operation: BlinkerConfigOperation.Install | BlinkerConfigOperation.Bootstrap;
}> {
  const info = decodeBlinkerConfigInfo(await transport.request(
    BLINKER_CONFIG_ENDPOINT,
    encodeBlinkerConfigInfoRequest(),
  ));

  if (info.supportsAccessBootstrap && !info.hasAccessState) {
    if (!bootstrap) {
      throw new BlinkerConfigError(
        'This device requires an access bootstrap before Wi-Fi provisioning',
        BlinkerConfigStatus.AccessRequired,
      );
    }
    decodeBlinkerConfigStatus(
      await transport.request(
        BLINKER_CONFIG_ENDPOINT,
        encodeBlinkerConfigBootstrap(deviceKey, bootstrap),
      ),
      BlinkerConfigOperation.Bootstrap,
    );
    return { info, operation: BlinkerConfigOperation.Bootstrap };
  }

  decodeBlinkerConfigStatus(
    await transport.request(
      BLINKER_CONFIG_ENDPOINT,
      encodeBlinkerConfigInstall(deviceKey),
    ),
    BlinkerConfigOperation.Install,
  );
  return { info, operation: BlinkerConfigOperation.Install };
}

function validateResponseHeader(
  response: Uint8Array,
  operation: BlinkerConfigOperation,
): void {
  if (response.length < 3) {
    throw new BlinkerConfigError('Blinker config response is truncated');
  }
  if (response[0] !== VERSION || response[1] !== operation) {
    throw new BlinkerConfigError('Blinker config response does not match the request');
  }
  const status = response[2] as BlinkerConfigStatus;
  if (status !== BlinkerConfigStatus.Success) {
    throw new BlinkerConfigError(
      `Blinker config request failed with status ${status}`,
      status,
    );
  }
}

function strictDeviceKeyText(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new BlinkerConfigError('DeviceKey must be 43 Base64URL characters');
  }

  const decoded = new Uint8Array(32);
  let accumulator = 0;
  let bits = 0;
  let cursor = 0;
  let nonZero = false;
  for (const character of value) {
    const digit = base64UrlDigit(character.charCodeAt(0));
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      const byte = (accumulator >> bits) & 0xff;
      decoded[cursor++] = byte;
      nonZero ||= byte !== 0;
    }
    accumulator &= bits === 0 ? 0 : (1 << bits) - 1;
  }
  if (cursor !== decoded.length || bits !== 2 || accumulator !== 0 || !nonZero) {
    throw new BlinkerConfigError('DeviceKey is not canonical Base64URL');
  }
  return new TextEncoder().encode(value);
}

function base64UrlDigit(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 45) return 62;
  if (code === 95) return 63;
  throw new BlinkerConfigError('DeviceKey contains invalid Base64URL data');
}

function exactNonZeroBytes(
  value: Uint8Array,
  size: number,
  label: string,
): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== size) {
    throw new BlinkerConfigError(`${label} must contain exactly ${size} bytes`);
  }
  if (!value.some(byte => byte !== 0)) {
    throw new BlinkerConfigError(`${label} must not be all zero`);
  }
  return value;
}

function strictU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffffffff) {
    throw new BlinkerConfigError(`${label} must be a non-zero uint32`);
  }
  return value;
}

function writeU32(output: Uint8Array, offset: number, value: number): void {
  new DataView(output.buffer, output.byteOffset, output.byteLength)
    .setUint32(offset, value, false);
}

function readU32(input: Uint8Array, offset: number): number {
  return new DataView(input.buffer, input.byteOffset, input.byteLength)
    .getUint32(offset, false);
}
