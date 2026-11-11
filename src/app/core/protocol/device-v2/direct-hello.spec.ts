import { describe, expect, it } from 'vitest';
import { encodeCanonicalArray as a, encodeCanonicalMap as m, encodeCanonicalUnsigned as u,
  CborReader, hexToBytes } from './codec';
import { decodeDirectDeviceHelloBody, DIRECT_FEATURE_TELEMETRY, encodeDirectAppHelloBody } from './direct-hello';

const hello = (packet?: number) => m([
  [0, u(0)], [1, a([u(2)])], [2, u(0x22e3)], [3, u(512)], [4, u(512)], [8, a([u(2)])], [9, u(4)],
  ...(packet === undefined ? [] : [[12, u(packet)]] as Array<[number, Uint8Array]>),
]);
describe('optional Direct BLE ATT limit', () => {
  it('keeps the old Hello vector available without optional telemetry and has no default BLE limit', () => {
    expect(encodeDirectAppHelloBody('controller', 512, false, undefined, false))
      .toEqual(hexToBytes('a70001018102021922e303190200041902000881020904'));
    expect(decodeDirectDeviceHelloBody(hello(), 'controller').blePacketSize).toBeUndefined();
  });
  it.each(['controller', 'transport'] as const)('requests only the existing telemetry feature on %s', security => {
    const reader = new CborReader(encodeDirectAppHelloBody(security));
    const count = reader.readMapSize(10);
    const keys: number[] = [];
    let features = 0;
    for (let index = 0; index < count; index++) {
      const key = reader.readUnsigned(); keys.push(key);
      if (key === 2) features = reader.readUnsigned();
      else if (key === 1 || key === 8) {
        for (let size = reader.readArraySize(4); size > 0; size--) reader.readUnsigned();
      } else reader.readUnsigned();
    }
    reader.finish();
    expect(features & DIRECT_FEATURE_TELEMETRY).toBe(DIRECT_FEATURE_TELEMETRY);
    expect(keys).not.toContain(5); // Hello does not advertise telemetry slots.
    expect(keys).not.toContain(12); // No implicit ATT-size negotiation on LAN.
  });
  it.each([20, 64, 244])('encodes/decodes canonical optional key12=%s without a new feature bit', packet => {
    expect(decodeDirectDeviceHelloBody(hello(packet), 'controller').blePacketSize).toBe(packet);
    const reader = new CborReader(encodeDirectAppHelloBody('controller', 512, false, packet));
    expect(reader.readMapSize(10)).toBe(8);
  });
  it.each([0, 19, 245])('rejects invalid peer limit%s', packet => {
    expect(() => decodeDirectDeviceHelloBody(hello(packet), 'controller')).toThrow();
    expect(() => encodeDirectAppHelloBody('controller', 512, false, packet)).toThrow('DIRECT_APP_HELLO_BLE_LIMIT_INVALID');
  });
  it('rejects fractional local capacity', () => {
    expect(() => encodeDirectAppHelloBody('controller', 512, false, 23.5)).toThrow('DIRECT_APP_HELLO_BLE_LIMIT_INVALID');
  });
  it.each([10, 11])('still rejects permanently reserved widget catalog key%s', key => {
    const legacy = m([[0, u(0)], [1, a([u(2)])], [2, u(0x22e3)], [3, u(512)], [4, u(512)],
      [8, a([u(2)])], [9, u(4)], [key, u(20)]]);
    expect(() => decodeDirectDeviceHelloBody(legacy, 'controller')).toThrow('DIRECT_HELLO_FIELD_UNSUPPORTED');
  });
});

describe('dedicated PreCloudDirect Hello', () => {
  const narrow = [[0, u(0)], [1, a([u(2)])], [2, u(0x20)], [3, u(512)], [4, u(512)], [8, a([u(2)])]] as [number, Uint8Array][];

  it('offers only Method 2 and accepts the actual auth-only peer, including the optional ATT limit', () => {
    expect(encodeDirectAppHelloBody('precloud-controller', 512, true, 64))
      .toEqual(hexToBytes('a7000101810202182003190200041902000881020c1840'));
    const peer = m([...narrow, [12, u(64)]]);
    expect(decodeDirectDeviceHelloBody(peer, 'precloud-controller')).toMatchObject({ features: 0x20, reliableWindow: 0, blePacketSize: 64 });
    for (const normal of ['controller', 'transport'] as const)
      expect(() => decodeDirectDeviceHelloBody(peer, normal)).toThrow('DIRECT_DEVICE_HELLO_INVALID');
  });

  it('rejects generic control, unsolicited reliable metadata and a mixed authentication method', () => {
    for (const wrong of [hello(), m([...narrow, [9, u(0)]]), m([...narrow.slice(0, -1), [8, a([u(2), u(1)])]])])
      expect(() => decodeDirectDeviceHelloBody(wrong, 'precloud-controller')).toThrow('DIRECT_DEVICE_HELLO_INVALID');
  });
});
