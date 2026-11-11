import { sameLocalAccessBytes } from '../../protocol/device-v2/local-access';
import { BleDirectCrypto } from '../ble-direct/crypto';
import { BLINKER_CONFIG_ENDPOINT, BlinkerConfigStatus, type Esp32ProvisioningTransport } from './esp32-wifiprov';

const VERSION = 2;
const HEADER = 2;
const ID = 16;
const OLD_BINDING = 72;
const NEW_BINDING = 88;
const IV = 12;
const BOX = 48;
const MAC = 32;
const PERSISTENCE_UNKNOWN = 9;

enum Operation { Challenge = 0x04, Install = 0x05, ReadReceipt = 0x06, WiFiPermit = 0x07, AdminNonce = 0x08, AdminBind = 0x09 }
const ADMIN_PREFIX = new TextEncoder().encode('blinker.wifiprov-rekey.setup-admin.v1\0');
const ADMIN_BINDING = OLD_BINDING + ID + 4 + ID;

export interface WiFiProvRekeyOldBinding {
  readonly operationId: Uint8Array;
  readonly challenge: Uint8Array;
  readonly instance: Uint8Array;
  readonly accessEpoch: number;
  readonly fromVersion: number;
  readonly oldLocator: Uint8Array;
}

export interface WiFiProvRekeyBinding extends WiFiProvRekeyOldBinding {
  readonly newLocator: Uint8Array;
}

export interface WiFiProvRekeyAdminCredential {
  readonly controllerId: Uint8Array;
  readonly credentialVersion: number;
  readonly controllerSecret: Uint8Array;
}

const failure = (code: string, status?: number) => Object.assign(Error(code), { code, status });
const invalid = () => failure('WIFIPROV_REKEY_REQUEST_INVALID');
const mismatch = () => failure('WIFIPROV_REKEY_PROTOCOL_MISMATCH');
const exact = (value: unknown, size: number): value is Uint8Array => value instanceof Uint8Array && value.length === size;
const nonZero = (value: unknown, size: number): value is Uint8Array => exact(value, size) && value.some(byte => byte !== 0);
const u32 = (value: number, max = 0xffffffff) => Number.isInteger(value) && value > 0 && value <= max;

function packet(operation: Operation, binding: WiFiProvRekeyOldBinding, length: number): Uint8Array {
  if (!binding || !nonZero(binding.operationId, ID) || !nonZero(binding.challenge, ID)
    || !nonZero(binding.instance, ID) || !nonZero(binding.oldLocator, ID)
    || !u32(binding.accessEpoch) || !u32(binding.fromVersion, 0xfffffffe)) throw invalid();
  const request = new Uint8Array(HEADER + length);
  request.set([VERSION, operation]);
  request.set(binding.operationId, HEADER);
  request.set(binding.challenge, HEADER + ID);
  request.set(binding.instance, HEADER + 2 * ID);
  const view = new DataView(request.buffer);
  view.setUint32(HEADER + 3 * ID, binding.accessEpoch, false);
  view.setUint32(HEADER + 3 * ID + 4, binding.fromVersion, false);
  request.set(binding.oldLocator, HEADER + OLD_BINDING - ID);
  return request;
}

function withNewLocator(operation: Operation.Install | Operation.ReadReceipt | Operation.WiFiPermit, binding: WiFiProvRekeyBinding,
  length: number): Uint8Array {
  if (!binding || !nonZero(binding.newLocator, ID) || !nonZero(binding.oldLocator, ID)
    || sameLocalAccessBytes(binding.newLocator, binding.oldLocator)) throw invalid();
  const request = packet(operation, binding, length);
  request.set(binding.newLocator, HEADER + OLD_BINDING);
  return request;
}

function decode(response: Uint8Array, operation: Operation, dataSize: number, expectedId?: Uint8Array): Uint8Array {
  const successSize = 3 + (expectedId ? ID : 0) + dataSize;
  if (!(response instanceof Uint8Array) || (response.length !== 3 && response.length !== successSize)
    || response[0] !== VERSION || response[1] !== operation) throw mismatch();
  const status = response[2];
  if (status !== BlinkerConfigStatus.Success) {
    if (response.length !== 3) throw mismatch();
    if (status === PERSISTENCE_UNKNOWN) throw failure('PROVISIONING_RESULT_UNKNOWN', status);
    if (status >= BlinkerConfigStatus.Malformed && status <= BlinkerConfigStatus.AccessRequired) {
      throw failure('WIFIPROV_REKEY_DEVICE_REJECTED', status);
    }
    throw mismatch();
  }
  if (response.length !== successSize || (expectedId && !sameLocalAccessBytes(response.subarray(3, 3 + ID), expectedId))) throw mismatch();
  const data = response.subarray(successSize - dataSize);
  if (dataSize && !nonZero(data, dataSize)) throw mismatch();
  return Uint8Array.from(data);
}

// Only fixed operations are exposed. This neither verifies the MAC nor authorizes
// a write/retry. A mismatch after sending Install cannot prove it was not applied.
async function exchange(transport: Esp32ProvisioningTransport, operation: Operation, request: Uint8Array,
  dataSize = MAC): Promise<Uint8Array> {
  const expectedId = operation === Operation.AdminNonce ? undefined : request.slice(HEADER, HEADER + ID);
  try { return decode(await transport.request(BLINKER_CONFIG_ENDPOINT, request), operation, dataSize, expectedId); }
  finally { request.fill(0); }
}

/** Returns the exact challenge MAC for the current operation, for immediate verification/relay. */
export async function challengeWiFiProvRekey(transport: Esp32ProvisioningTransport, binding: WiFiProvRekeyOldBinding): Promise<Uint8Array> {
  return exchange(transport, Operation.Challenge, packet(Operation.Challenge, binding, OLD_BINDING));
}

/** One fixed candidate install. The caller owns the durable dispatch guard. */
export async function installWiFiProvRekey(transport: Esp32ProvisioningTransport, binding: WiFiProvRekeyBinding,
  iv: Uint8Array, box: Uint8Array): Promise<Uint8Array> {
  if (!nonZero(iv, IV) || !exact(box, BOX)) throw invalid();
  const request = withNewLocator(Operation.Install, binding, NEW_BINDING + IV + BOX);
  request.set(iv, HEADER + NEW_BINDING);
  request.set(box, HEADER + NEW_BINDING + IV);
  return exchange(transport, Operation.Install, request);
}

/** Read back proof for the same operation without ever sending another install. */
export async function readWiFiProvRekeyReceipt(transport: Esp32ProvisioningTransport, binding: WiFiProvRekeyBinding): Promise<Uint8Array> {
  return exchange(transport, Operation.ReadReceipt, withNewLocator(Operation.ReadReceipt, binding, NEW_BINDING));
}

/** Arms only the exact Gateway-committed intent in the same device setup owner. */
export async function acceptWiFiProvRekeyPermit(transport: Esp32ProvisioningTransport, binding: WiFiProvRekeyBinding,
  permit: Uint8Array): Promise<void> {
  if (!nonZero(permit, MAC)) throw invalid();
  const request = withNewLocator(Operation.WiFiPermit, binding, NEW_BINDING + MAC);
  request.set(permit, HEADER + NEW_BINDING);
  await exchange(transport, Operation.WiFiPermit, request, 0);
}

/** Admin secret stays local. A fresh challenge binds this live owner; caller owns credential cleanup. */
export async function authorizeWiFiProvRekeySetup(transport: Esp32ProvisioningTransport, binding: WiFiProvRekeyOldBinding,
  credential: WiFiProvRekeyAdminCredential, assertCurrent: () => void,
  hash: Pick<BleDirectCrypto, 'hmac'> = new BleDirectCrypto()): Promise<void> {
  if (!credential || !nonZero(credential.controllerId, ID) || !u32(credential.credentialVersion)
    || !nonZero(credential.controllerSecret, MAC)) throw invalid();
  const request = packet(Operation.AdminBind, binding, ADMIN_BINDING + MAC);
  request.set(credential.controllerId, HEADER + OLD_BINDING);
  new DataView(request.buffer).setUint32(HEADER + OLD_BINDING + ID, credential.credentialVersion, false);
  let nonce: Uint8Array | undefined, mac: Uint8Array | undefined;
  try {
    assertCurrent();
    nonce = await exchange(transport, Operation.AdminNonce, Uint8Array.of(VERSION, Operation.AdminNonce), ID);
    assertCurrent();
    request.set(nonce, HEADER + OLD_BINDING + ID + 4);
    mac = await hash.hmac(credential.controllerSecret, ADMIN_PREFIX, request.subarray(HEADER, HEADER + ADMIN_BINDING));
    assertCurrent();
    if (!nonZero(mac, MAC)) throw invalid();
    request.set(mac, HEADER + ADMIN_BINDING);
    await exchange(transport, Operation.AdminBind, request, 0);
    assertCurrent();
  } finally { nonce?.fill(0); mac?.fill(0); request.fill(0); }
}
