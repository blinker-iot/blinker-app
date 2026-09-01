import { BleDirectCrypto, constantTimeEqual } from './crypto';

export const BLE_PRESENCE_KEY_SIZE = 16;
export const BLE_PRESENCE_NONCE_SIZE = 4;
export const BLE_PRESENCE_TAG_SIZE = 4;
export const BLE_PRESENCE_LOCATOR_SIZE = 8;

const DOMAIN = Uint8Array.from([
  ...new TextEncoder().encode('blinker/ble/presence/v1'),
  0,
]);

export interface BlePresenceContext {
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  presenceKeyVersion: number;
}

export async function deriveBlePresenceLocator(
  presenceKey: Uint8Array,
  context: BlePresenceContext,
  nonce: Uint8Array,
  crypto = new BleDirectCrypto(),
): Promise<Uint8Array> {
  exactNonZero(presenceKey, BLE_PRESENCE_KEY_SIZE, 'key');
  exactNonZero(context.deviceInstanceId, 16, 'device instance id');
  exact(nonce, BLE_PRESENCE_NONCE_SIZE, 'nonce');
  const metadata = new Uint8Array(8);
  const view = new DataView(metadata.buffer);
  view.setUint32(0, u32(context.accessEpoch, 'access epoch'), false);
  view.setUint32(4, u32(context.presenceKeyVersion, 'key version'), false);
  const digest = await crypto.hmac(
    presenceKey,
    DOMAIN,
    context.deviceInstanceId,
    metadata,
    nonce,
  );
  const locator = new Uint8Array(BLE_PRESENCE_LOCATOR_SIZE);
  locator.set(nonce, 0);
  locator.set(digest.subarray(0, BLE_PRESENCE_TAG_SIZE), BLE_PRESENCE_NONCE_SIZE);
  digest.fill(0);
  metadata.fill(0);
  return locator;
}

export async function matchesBlePresenceLocator(
  presenceKey: Uint8Array,
  context: BlePresenceContext,
  locator: Uint8Array,
  crypto = new BleDirectCrypto(),
): Promise<boolean> {
  exact(locator, BLE_PRESENCE_LOCATOR_SIZE, 'locator');
  const expected = await deriveBlePresenceLocator(
    presenceKey,
    context,
    locator.slice(0, BLE_PRESENCE_NONCE_SIZE),
    crypto,
  );
  const matches = constantTimeEqual(expected, locator);
  expected.fill(0);
  return matches;
}

function exact(value: Uint8Array, size: number, name: string): void {
  if (!(value instanceof Uint8Array) || value.length !== size) {
    throw new Error(`BLE_PRESENCE_${name.toUpperCase().replaceAll(' ', '_')}_INVALID`);
  }
}

function exactNonZero(value: Uint8Array, size: number, name: string): void {
  exact(value, size, name);
  if (!value.some(byte => byte !== 0)) {
    throw new Error(`BLE_PRESENCE_${name.toUpperCase().replaceAll(' ', '_')}_INVALID`);
  }
}

function u32(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error(`BLE_PRESENCE_${name.toUpperCase().replaceAll(' ', '_')}_INVALID`);
  }
  return value;
}
