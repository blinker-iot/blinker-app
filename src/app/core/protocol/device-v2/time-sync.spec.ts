import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BBP2_FEATURE_TIME_SYNC as feature, APP_FEATURES, encodeTimeRequest, decodeTimeRequest,
  encodeTimeResponse, decodeTimeResponse, encodeRouteBody, encodeFrame as encode, decodeFrame as decode } from './codec';
import { Bbp2MessageKind as kinds } from './types';
const EQUAL = (a: unknown, b: unknown) => expect(a).toEqual(b);
const THROWS = (fn: () => unknown) => expect(fn).toThrow();

// Checked-in mirror keeps this repository independently testable; the release
// integration run also points this test at the device library's canonical file.
const golden = Object.fromEntries(readFileSync(process.env['BLINKER_TIME_SYNC_GOLDEN']
  ?? resolve(process.cwd(), 'tests/fixtures/time_sync_golden_vectors.properties'), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('=')));
const bytes = (key: string) => Buffer.from(golden[key], 'hex');
const sample = { nonce: bytes('nonce'), utcAtReplyMillis: Number(golden.utc_ms),
  uncertaintyMillis: Number(golden.uncertainty_ms) };

test('TimeSync matches shared canonical bodies and BBP frames', () => {
  EQUAL(feature, parseInt(golden.feature, 16));
  EQUAL(kinds.TimeRequest, parseInt(golden.request_kind, 16));
  EQUAL(kinds.TimeResponse, parseInt(golden.response_kind, 16));
  EQUAL(Buffer.from(encodeTimeRequest(sample.nonce)), bytes('request'));
  EQUAL(Buffer.from(decodeTimeRequest(bytes('request'))), sample.nonce);
  EQUAL(Buffer.from(encodeTimeResponse(sample)), bytes('response'));
  const decoded = decodeTimeResponse(bytes('response'));
  EQUAL(Buffer.from(decoded.nonce), sample.nonce);
  EQUAL(decoded.utcAtReplyMillis, sample.utcAtReplyMillis);
  EQUAL(decoded.uncertaintyMillis, sample.uncertaintyMillis);
  for (const [key, kind, flags] of [['request', kinds.TimeRequest, 0], ['response', kinds.TimeResponse, 2]] as const) {
    const frame = { kind, flags, sequence: 0x1234, body: bytes(key) };
    EQUAL(Buffer.from(encode(frame)), bytes(key + '_frame'));
    EQUAL(Buffer.from(decode(bytes(key + '_frame')).body), bytes(key));
  }
});

test('TimeSync rejects all shared malformed bodies and every truncated prefix', () => {
  for (const key of Object.keys(golden).filter(key => key.startsWith('invalid_'))) {
    const decoder = key.startsWith('invalid_request') ? decodeTimeRequest : decodeTimeResponse;
    THROWS(() => decoder(bytes(key)));
  }
  for (const [key, decoder] of [['request', decodeTimeRequest], ['response', decodeTimeResponse]] as const) {
    for (let size = 0; size < bytes(key).length; ++size) THROWS(() => decoder(bytes(key).subarray(0, size)));
  }
});

test('TimeSync enforces millisecond UTC, integer uncertainty and nonce bounds', () => {
  for (const uncertaintyMillis of [0, 23, 24, 255, 256, 60000]) {
    for (const utcAtReplyMillis of [946684800000, 4102444799999]) {
      const value = { ...sample, uncertaintyMillis, utcAtReplyMillis };
      const body = encodeTimeResponse(value);
      EQUAL(body.length <= 30, true);
      EQUAL(decodeTimeResponse(body).utcAtReplyMillis, utcAtReplyMillis);
      EQUAL(decodeTimeResponse(body).uncertaintyMillis, uncertaintyMillis);
    }
  }
  for (const utcAtReplyMillis of [0, 1789260000, 946684799999, 4102444800000, NaN, Infinity, 1789260000000.5])
    THROWS(() => encodeTimeResponse({ ...sample, utcAtReplyMillis }));
  for (const uncertaintyMillis of [-1, 60001, 0.5, NaN, Infinity])
    THROWS(() => encodeTimeResponse({ ...sample, uncertaintyMillis }));
  for (const nonce of [Buffer.alloc(16), Buffer.alloc(15, 1), Buffer.alloc(17, 1)]) {
    THROWS(() => encodeTimeRequest(nonce));
    THROWS(() => encodeTimeResponse({ ...sample, nonce }));
  }
});

test('codec availability does not advertise an uninstalled App responder', () => {
  expect(APP_FEATURES & feature).toBe(0);
});

test('TimeSync cannot be injected through ordinary App account routes', () => {
  for (const messageKind of [kinds.TimeRequest, kinds.TimeResponse]) {
    expect(() => encodeRouteBody({ peerKind: 0, peerId: new Uint8Array(16).fill(1),
      requestId: new Uint8Array(16).fill(2), messageKind, messageFlags: 0,
      messageBody: bytes('request') })).toThrow();
  }
});
