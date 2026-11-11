import { describe, expect, it } from 'vitest';
import { DirectTimeOptions, DirectTimeResponder } from './direct-time';
import { BBP2_FEATURE_TIME_SYNC, decodeTimeResponse, encodeTimeRequest, encodeFrame, decodeErrorBody,
  CborReader, encodeCanonicalMap, encodeCanonicalArray, encodeCanonicalUnsigned } from './codec';
import { Bbp2FrameFlag, Bbp2MessageKind } from './types';
import { decodeDirectDeviceHelloBody, encodeDirectAppHelloBody } from './direct-hello';

const nonce = new Uint8Array(16).fill(7);
const request = () => ({ kind: Bbp2MessageKind.TimeRequest, flags: 0, sequence: 65535, body: encodeTimeRequest(nonce) });
function fixture(patch: Partial<DirectTimeOptions> = {}) {
  const clock = { utc: 1789260000000, tick: 0 };
  const responder = new DirectTimeResponder({ permissions: 3, features: BBP2_FEATURE_TIME_SYNC, maxFrameSize: 40,
    utcNow: () => clock.utc, monotonicNow: () => clock.tick, ...patch });
  return { clock, responder };
}
describe('Direct business-time responder', () => {
  it('replies within 40 bytes with the exact sequence/nonce and no reliable flag', () => {
    const { responder, clock } = fixture(), reply = responder.reply(request())!;
    expect(reply.sequence).toBe(65535); expect(reply.flags).toBe(Bbp2FrameFlag.IsResponse);
    expect(reply.kind).toBe(Bbp2MessageKind.TimeResponse); expect(encodeFrame(reply).length).toBe(40);
    expect(decodeTimeResponse(reply.body)).toEqual({ nonce, utcAtReplyMillis: clock.utc, uncertaintyMillis: 1000 });
  });
  it.each([{ permissions: 1 }, { permissions: 0 }, { features: 0 }, { maxFrameSize: 39 }])('does not respond without admission %j', patch => {
    expect(fixture(patch).responder.reply(request())).toBeUndefined();
  });
  it('uses a 5-second monotonic quota, independent of UTC corrections', () => {
    const { responder, clock } = fixture(); expect(responder.reply(request())).toBeDefined();
    clock.utc += 3600000; clock.tick = 4999; expect(responder.reply(request())).toBeUndefined();
    clock.tick = 5000; expect(responder.reply(request())).toBeDefined();
    clock.tick = 4999; expect(responder.reply(request())).toBeUndefined();
  });
  it.each([0, NaN, 4102444800000])('reports unavailable UTC %s without installing zero or bypassing quota', utc => {
    const { responder, clock } = fixture(); clock.utc = utc;
    const error = responder.reply(request())!; expect(error.kind).toBe(Bbp2MessageKind.Error);
    expect(decodeErrorBody(error.body)).toEqual({ errorCode: 8, relatedSequence: 65535 });
    expect(encodeFrame(error).length).toBeLessThanOrEqual(40);
    expect(responder.reply(request())).toBeUndefined();
  });
  it.each([{ flags: 1 }, { flags: 2 }, { sequence: 0 }, { sequence: 65536 }, { body: new Uint8Array(18) }])('rejects malformed requests %j', patch => {
    expect(() => fixture().responder.reply({ ...request(), ...patch })).toThrow();
  });
  it('does not advertise time on an uninstalled or undersized Hello', () => {
    for (const [size, enabled, expected] of [[512, false, false], [39, true, false], [40, true, true]] as const) {
      const reader = new CborReader(encodeDirectAppHelloBody('controller', size, enabled));
      reader.readMapSize(9); expect(reader.readUnsigned()).toBe(0); expect(reader.readUnsigned()).toBe(1);
      expect(reader.readUnsigned()).toBe(1); expect(reader.readArraySize(4)).toBe(1); expect(reader.readUnsigned()).toBe(2);
      expect(reader.readUnsigned()).toBe(2);
      expect((reader.readUnsigned() & BBP2_FEATURE_TIME_SYNC) !== 0).toBe(expected);
    }
  });
  it('accepts the installed time capability but still rejects unknown device bits', () => {
    const hello = (extra: number) => encodeCanonicalMap([
      [0, encodeCanonicalUnsigned(0)],
      [1, encodeCanonicalArray([encodeCanonicalUnsigned(2)])],
      [2, encodeCanonicalUnsigned(0xe3 | extra)],
      [3, encodeCanonicalUnsigned(512)], [4, encodeCanonicalUnsigned(512)],
      [8, encodeCanonicalArray([encodeCanonicalUnsigned(2)])], [9, encodeCanonicalUnsigned(4)],
    ]);
    expect(decodeDirectDeviceHelloBody(hello(BBP2_FEATURE_TIME_SYNC), 'controller').features)
      .toBe(0xe3 | BBP2_FEATURE_TIME_SYNC);
    expect(() => decodeDirectDeviceHelloBody(hello(1 << 25), 'controller')).toThrow('DIRECT_DEVICE_HELLO_INVALID');
  });
});
