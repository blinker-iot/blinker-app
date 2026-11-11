import { decodeStatePageBody } from '../protocol/device-v2/codec';

export const STATE_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const STATE_HISTORY_MAX_RECORDS = 10000;
export const STATE_HISTORY_PAGE_LIMIT = 50;
export const STATE_HISTORY_VIEW_LIMIT = 200;
export const STATE_HISTORY_RECORDED_TYPES = [0, 1, 2, 3, 4, 5] as const;

// Existing V2 State DTO shape. H1's parser admits only recordedTypes 0..5;
// null/bytes/containers and base64url byte values are not reachable here.
export interface StateHistoryValue {
  type: number;
  cbor: string;
  value?: boolean | number | string | null;
  encoding?: 'int64' | 'uint64' | 'base64url';
}
export interface StateHistoryItem {
  id: string;
  segmentId: string;
  key: string;
  kind: 0;
  type: number;
  state: StateHistoryValue;
  revision: number;
  manifestFingerprint: string;
  observedAt: number;
  event: 'baseline' | 'change';
}
export interface StateHistoryQuery {
  from: number;
  to: number;
  limit: number;
  key?: string;
  before?: string;
}
export interface StateHistoryPage {
  logicalDeviceId: string;
  from: number;
  to: number;
  items: StateHistoryItem[];
  nextCursor: string | null;
  retention: { maxAgeMs: number; maxRecords: number };
  timeBasis: 'serverAcceptedAt';
  source: 'broker-state';
  recordedTypes: number[];
}

const encoder = new TextEncoder();
const assert: (ok: unknown) => asserts ok = ok => {
  if (!ok) throw Error('STATE_HISTORY_RESPONSE_INVALID');
};
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  assert(required.every(key => Object.hasOwn(record, key))
    && Object.keys(record).every(key => required.includes(key) || optional.includes(key)));
  return record;
}
function utc(value: unknown): asserts value is number {
  assert(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 8640000000000000);
}
export function stateHistoryDeviceId(value: unknown): asserts value is string {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value));
}
function key(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && encoder.encode(value).length <= 64
    && !value.includes('\0')
    && new TextDecoder().decode(encoder.encode(value)) === value);
}
function cursor(value: unknown): asserts value is string {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value));
  encoded(value);
}
export function stateHistoryQuery(value: StateHistoryQuery): StateHistoryQuery {
  const record = object(value, ['from', 'to', 'limit'], ['key', 'before']);
  utc(record['from']); utc(record['to']);
  assert(record['from'] < record['to'] && record['to'] - record['from'] <= STATE_HISTORY_MAX_AGE_MS
    && Number.isInteger(record['limit']) && Number(record['limit']) >= 1 && Number(record['limit']) <= STATE_HISTORY_PAGE_LIMIT);
  if (record['key'] !== undefined) key(record['key']);
  if (record['before'] !== undefined) cursor(record['before']);
  return { from: record['from'], to: record['to'], limit: Number(record['limit']),
    ...(record['key'] === undefined ? {} : { key: record['key'] as string }),
    ...(record['before'] === undefined ? {} : { before: record['before'] as string }) };
}
function encoded(value: unknown): Uint8Array {
  assert(typeof value === 'string' && value.length <= 684 && /^[A-Za-z0-9_-]+$/.test(value));
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0)); }
  catch { throw Error('STATE_HISTORY_RESPONSE_INVALID'); }
  assert(bytes.length <= 512 && toBase64(bytes) === value);
  return bytes;
}
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function parseHistoryStateValue(value: unknown, fieldKey: string, type: number): StateHistoryValue {
  const record = object(value, ['type', 'cbor'], ['value', 'encoding']);
  assert(record['type'] === type);
  const bytes = encoded(record['cbor']);
  // Reuse the State decoder with the recorded field's type, never the current
  // Manifest. This one-field envelope is only an in-memory validation adapter.
  const body = Uint8Array.from([0xa5, 0, 0, 1, 0, 2, 1, 3, 1, 4, 0xa1, 1, ...bytes]);
  let decoded;
  try { decoded = decodeStatePageBody(body, [{ key: fieldKey, kind: 0, type, access: 1, id: 1 }]).values[fieldKey]; }
  catch { throw Error('STATE_HISTORY_RESPONSE_INVALID'); }
  const actual = decoded.value;
  if (typeof actual === 'bigint') {
    assert(type !== 1 || actual >= -9223372036854775808n && actual <= 9223372036854775807n);
    assert(record['value'] === actual.toString() && record['encoding'] === (type === 1 ? 'int64' : 'uint64'));
  } else {
    // JSON persistence normalizes float -0 to 0; the exact CBOR remains stored.
    assert(Object.hasOwn(record, 'value') && (Object.is(record['value'], actual)
      || (type === 3 || type === 4) && record['value'] === 0 && actual === 0)
      && !Object.hasOwn(record, 'encoding'));
  }
  return { type, cbor: record['cbor'] as string,
    ...(Object.hasOwn(record, 'value') ? { value: record['value'] as StateHistoryValue['value'] } : {}),
    ...(Object.hasOwn(record, 'encoding') ? { encoding: record['encoding'] as StateHistoryValue['encoding'] } : {}) };
}
function item(value: unknown, query: StateHistoryQuery): StateHistoryItem {
  const record = object(value, ['id', 'segmentId', 'key', 'kind', 'type', 'state', 'revision', 'manifestFingerprint', 'observedAt', 'event']);
  assert(typeof record['id'] === 'string' && /^[1-9][0-9]{0,18}$/.test(record['id'])
    && BigInt(record['id']) <= 9223372036854775807n
    && typeof record['segmentId'] === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(record['segmentId']));
  key(record['key']);
  assert(record['kind'] === 0 && STATE_HISTORY_RECORDED_TYPES.includes(record['type'] as any)
    && Number.isInteger(record['revision']) && Number(record['revision']) >= 0 && Number(record['revision']) <= 0xffffffff
    && typeof record['manifestFingerprint'] === 'string' && /^[0-9a-f]{64}$/.test(record['manifestFingerprint'])
    && (record['event'] === 'baseline' || record['event'] === 'change'));
  utc(record['observedAt']);
  assert(record['observedAt'] >= query.from && record['observedAt'] < query.to
    && (query.key === undefined || record['key'] === query.key));
  return { id: record['id'], segmentId: record['segmentId'], key: record['key'], kind: 0,
    type: Number(record['type']), state: parseHistoryStateValue(record['state'], record['key'], Number(record['type'])),
    revision: Number(record['revision']), manifestFingerprint: record['manifestFingerprint'],
    observedAt: record['observedAt'], event: record['event'] };
}
export function parseStateHistoryPage(value: unknown, logicalDeviceId: string, input: StateHistoryQuery): StateHistoryPage {
  stateHistoryDeviceId(logicalDeviceId);
  const query = stateHistoryQuery(input);
  const record = object(value, ['logicalDeviceId', 'from', 'to', 'items', 'nextCursor', 'retention', 'timeBasis', 'source', 'recordedTypes']);
  assert(record['logicalDeviceId'] === logicalDeviceId && record['from'] === query.from && record['to'] === query.to
    && record['timeBasis'] === 'serverAcceptedAt' && record['source'] === 'broker-state'
    && JSON.stringify(record['recordedTypes']) === JSON.stringify(STATE_HISTORY_RECORDED_TYPES)
    && Array.isArray(record['items']) && record['items'].length <= query.limit);
  const retention = object(record['retention'], ['maxAgeMs', 'maxRecords']);
  assert(retention['maxAgeMs'] === STATE_HISTORY_MAX_AGE_MS && retention['maxRecords'] === STATE_HISTORY_MAX_RECORDS);
  if (record['nextCursor'] !== null) cursor(record['nextCursor']);
  const items = record['items'].map(value => item(value, query));
  const ids = new Set(items.map(value => value.id));
  assert(ids.size === items.length && (record['nextCursor'] === null || items.length > 0)
    && record['nextCursor'] !== query.before
    && items.every((value, index) => index === 0 || BigInt(value.id) < BigInt(items[index - 1].id)));
  return { logicalDeviceId, from: query.from, to: query.to, items,
    nextCursor: record['nextCursor'] as string | null, retention: { maxAgeMs: STATE_HISTORY_MAX_AGE_MS, maxRecords: STATE_HISTORY_MAX_RECORDS },
    timeBasis: 'serverAcceptedAt', source: 'broker-state', recordedTypes: [...STATE_HISTORY_RECORDED_TYPES] };
}
