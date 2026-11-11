import { describe, expect, it } from 'vitest';

import { BleDirectCrypto } from './crypto';
import {
  deriveBlePresenceLocator,
  matchesBlePresenceLocator,
} from './presence';

const fromHex = (value: string): Uint8Array => Uint8Array.from(
  value.match(/../g) ?? [], pair => Number.parseInt(pair, 16),
);
const hex = (value: Uint8Array): string => Array.from(
  value, byte => byte.toString(16).padStart(2, '0'),
).join('');

describe('authorized BLE presence', () => {
  it('matches the frozen cross-language locator vector', async () => {
    const key = fromHex('000102030405060708090a0b0c0d0e0f');
    const context = {
      deviceInstanceId: fromHex('101112131415161718191a1b1c1d1e1f'),
      accessEpoch: 0x01020304,
      presenceKeyVersion: 0x05060708,
    };
    const locator = await deriveBlePresenceLocator(
      key,
      context,
      fromHex('a0a1a2a3'),
      new BleDirectCrypto(),
    );
    expect(hex(locator)).toBe('a0a1a2a35944bb16');
    await expect(matchesBlePresenceLocator(key, context, locator)).resolves.toBe(true);
    locator[7] = locator[7]! ^ 1;
    await expect(matchesBlePresenceLocator(key, context, locator)).resolves.toBe(false);
  });
});
