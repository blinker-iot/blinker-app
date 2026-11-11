import { parseStateHistoryPage, stateHistoryQuery, STATE_HISTORY_MAX_AGE_MS, STATE_HISTORY_MAX_RECORDS,
  STATE_HISTORY_RECORDED_TYPES } from './state-history';

const id = 'device_a', query = { from: 1000, to: 2000, limit: 50 };
const row = { id: '42', segmentId: '12345678-1234-4234-9234-123456789abc', key: 'power', kind: 0, type: 0,
  state: { type: 0, cbor: '9Q', value: true }, revision: 2, manifestFingerprint: 'a'.repeat(64), observedAt: 1500, event: 'change' };
function result(items: any[] = [row]): any { return { logicalDeviceId: id, from: query.from, to: query.to, items, nextCursor: null,
  retention: { maxAgeMs: STATE_HISTORY_MAX_AGE_MS, maxRecords: STATE_HISTORY_MAX_RECORDS },
  timeBasis: 'serverAcceptedAt', source: 'broker-state', recordedTypes: [...STATE_HISTORY_RECORDED_TYPES] }; }
function base64(bytes: number[]) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

describe('State history exact server contract', () => {
  it('parses a real typed record and half-open server time range without changing the source', () => {
    expect(parseStateHistoryPage(result(), id, query)).toEqual(result());
    expect(parseStateHistoryPage(result([]), id, query).items).toEqual([]);
    expect(parseStateHistoryPage(result([{ ...row, observedAt: query.from, event: 'baseline' }]), id, query).items[0].event).toBe('baseline');
    const exactKey = ' power\n ';
    expect(parseStateHistoryPage(result([{ ...row, key: exactKey }]), id, { ...query, key: exactKey }).items[0].key).toBe(exactKey);
  });
  it.each([
    { logicalDeviceId: 'device_other' }, { from: 0 }, { to: 2001 }, { source: 'device-command' },
    { timeBasis: 'deviceTime' }, { recordedTypes: [0, 1, 2, 3, 4, 5, 9] },
    { retention: { maxAgeMs: 1, maxRecords: 10000 } }, { retention: { maxAgeMs: STATE_HISTORY_MAX_AGE_MS, maxRecords: 20000 } },
    { fabricated: true }, { nextCursor: 'not canonical=' }, { nextCursor: 'A'.repeat(513) },
  ])('rejects response metadata mismatch %j', patch => {
    expect(() => parseStateHistoryPage({ ...result(), ...patch }, id, query)).toThrow('STATE_HISTORY_RESPONSE_INVALID');
  });
  it.each([
    { id: '0' }, { id: '0042' }, { id: '9223372036854775808' }, { segmentId: 'unknown' },
    { key: '' }, { key: 'bad\0key' }, { kind: 1 }, { type: 6 }, { type: 7 }, { type: 8 }, { type: 9 },
    { revision: -1 }, { revision: 0x100000000 }, { manifestFingerprint: 'unknown' },
    { observedAt: query.to }, { observedAt: query.from - 1 }, { observedAt: NaN }, { event: 'command' },
    { state: { type: 0, cbor: '9A', value: true } }, { state: { type: 0, cbor: '9Q', value: 1 } },
    { state: { type: 0, cbor: '9Q', value: true, encoding: 'int64' } },
    { state: { type: 1, cbor: '9Q', value: true } }, { state: { type: 0, cbor: '9Q==' , value: true } },
    { state: { type: 0, cbor: '9QAA', value: true } },
  ])('rejects malformed/false/unsupported history item %j', patch => {
    expect(() => parseStateHistoryPage(result([{ ...row, ...patch }]), id, query)).toThrow('STATE_HISTORY_RESPONSE_INVALID');
  });
  it('enforces id-desc ordering, response size and selected key, never duplicate or empty progressing pages', () => {
    expect(parseStateHistoryPage(result([row, { ...row, id: '41' }]), id, query).items).toHaveLength(2);
    for (const items of [[row, row], [{ ...row, id: '41' }, row], Array.from({ length: 51 }, (_, n) => ({ ...row, id: String(100 - n) }))]) {
      expect(() => parseStateHistoryPage(result(items), id, query)).toThrow();
    }
    expect(() => parseStateHistoryPage(result(), id, { ...query, key: 'level' })).toThrow();
    expect(() => parseStateHistoryPage({ ...result([]), nextCursor: 'YWJj' }, id, query)).toThrow();
    expect(() => parseStateHistoryPage({ ...result(), nextCursor: 'YWJj' }, id, { ...query, before: 'YWJj' })).toThrow();
  });
  it('keeps both signed and unsigned 64-bit values as exact strings', () => {
    const unsigned = { ...row, type: 2, state: { type: 2, cbor: base64([0x1b, ...Array(8).fill(255)]),
      value: '18446744073709551615', encoding: 'uint64' } };
    const signed = { ...row, type: 1, state: { type: 1, cbor: base64([0x3b, 127, ...Array(7).fill(255)]),
      value: '-9223372036854775808', encoding: 'int64' } };
    expect(parseStateHistoryPage(result([unsigned]), id, query).items[0].state.value).toBe('18446744073709551615');
    expect(parseStateHistoryPage(result([signed]), id, query).items[0].state.value).toBe('-9223372036854775808');
    expect(() => parseStateHistoryPage(result([{ ...unsigned, state: { ...unsigned.state, value: Number(unsigned.state.value) } }]), id, query)).toThrow();
    expect(() => parseStateHistoryPage(result([{ ...unsigned, type: 1, state: { ...unsigned.state, type: 1, encoding: 'int64' } }]), id, query)).toThrow();
  });
  it.each([
    [1, { type: 1, cbor: 'IQ', value: -2 }], [2, { type: 2, cbor: 'GCo', value: 42 }],
    [3, { type: 3, cbor: base64([0xfa, 0x3f, 0xc0, 0, 0]), value: 1.5 }],
    [4, { type: 4, cbor: base64([0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0]), value: 1.5 }],
    [5, { type: 5, cbor: 'Ymhp', value: 'hi' }], [5, { type: 5, cbor: 'YA', value: '' }],
  ])('reuses recorded State CBOR validation for scalar type %i', (type, state) => {
    expect(parseStateHistoryPage(result([{ ...row, type, state }]), id, query).items[0].state).toEqual(state);
  });
  it.each([3, 4])('preserves exact float CBOR while accepting JSON-normalized -0 for type %i', type => {
    const state = { type, cbor: base64(type === 3 ? [0xfa, 0x80, 0, 0, 0] : [0xfb, 0x80, 0, 0, 0, 0, 0, 0, 0]), value: 0 };
    expect(parseStateHistoryPage(result([{ ...row, type, state }]), id, query).items[0].state).toEqual(state);
  });
  it.each([
    { from: -1 }, { to: 1000 }, { to: 1000 + STATE_HISTORY_MAX_AGE_MS + 1 }, { from: 1.5 },
    { limit: 0 }, { limit: 51 }, { key: '' }, { before: '' }, { before: 'x=' }, { before: 'Z' },
  ])('validates request bounds and opaque canonical cursors before sending %j', patch => {
    expect(() => stateHistoryQuery({ ...query, ...patch })).toThrow();
  });
});
