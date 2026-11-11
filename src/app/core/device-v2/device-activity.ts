export const ACTIVITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ACTIVITY_PAGE_LIMIT = 20;
export const ACTIVITY_MAX_PAGE_LIMIT = 50;

export interface ActivityQuery { from: number; to: number; limit: number; before?: string }
export interface ActivityItem {
  id: string;
  endpointKey: string;
  status: 'inflight' | 'acknowledged' | 'rejected' | 'outcome_unknown' | 'not_sent';
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
}
export interface ActivityPage {
  logicalDeviceId: string;
  from: number;
  to: number;
  items: ActivityItem[];
  nextCursor: string | null;
  retention: { maxAgeMs: number };
  timeBasis: 'serverRecordedAt';
  source: 'broker-command';
}

const encoder = new TextEncoder();
const assert: (ok: unknown) => asserts ok = ok => {
  if (!ok) throw Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
};
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  assert(required.every(key => Object.hasOwn(record, key))
    && Object.keys(record).every(key => required.includes(key) || optional.includes(key)));
  return record;
}
function epoch(value: unknown, minimum = 0): asserts value is number {
  assert(Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 8640000000000000);
}
function cursor(value: unknown): asserts value is string {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value));
  let binary: string;
  try { binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)); }
  catch { throw Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID'); }
  assert(btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === value);
}
export function activityDeviceId(value: unknown): asserts value is string {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value));
}
export function activityQuery(value: Omit<ActivityQuery, 'limit'> & { limit?: number }): ActivityQuery {
  const record = object(value, ['from', 'to'], ['limit', 'before']);
  epoch(record['from']); epoch(record['to']);
  const limit = record['limit'] === undefined ? ACTIVITY_PAGE_LIMIT : record['limit'];
  assert(record['from'] < record['to'] && record['to'] - record['from'] <= ACTIVITY_MAX_AGE_MS
    && Number.isSafeInteger(limit) && Number(limit) >= 1 && Number(limit) <= ACTIVITY_MAX_PAGE_LIMIT);
  if (record['before'] !== undefined) cursor(record['before']);
  return { from: record['from'], to: record['to'], limit: Number(limit),
    ...(record['before'] === undefined ? {} : { before: record['before'] as string }) };
}
function item(value: unknown, query: ActivityQuery): ActivityItem {
  const record = object(value, ['id', 'endpointKey', 'status', 'attemptCount', 'createdAt', 'updatedAt']);
  assert(typeof record['id'] === 'string' && /^[1-9][0-9]{0,18}$/.test(record['id'])
    && BigInt(record['id']) <= 9223372036854775807n);
  const key = record['endpointKey'];
  assert(typeof key === 'string' && key.length > 0 && !key.includes('\0')
    && encoder.encode(key).length <= 64 && new TextDecoder().decode(encoder.encode(key)) === key);
  assert(['inflight', 'acknowledged', 'rejected', 'outcome_unknown', 'not_sent'].includes(record['status'] as string)
    && Number.isSafeInteger(record['attemptCount']) && Number(record['attemptCount']) >= 0);
  epoch(record['createdAt'], 1); epoch(record['updatedAt'], 1);
  assert(record['createdAt'] >= query.from && record['createdAt'] < query.to);
  // These are server wall-clock observations, not device execution timestamps.
  // A clock adjustment may place updatedAt before createdAt or outside this range.
  return { id: record['id'], endpointKey: key, status: record['status'] as ActivityItem['status'],
    attemptCount: Number(record['attemptCount']), createdAt: record['createdAt'], updatedAt: record['updatedAt'] };
}
export function parseActivityPage(value: unknown, logicalDeviceId: string, input: ActivityQuery): ActivityPage {
  activityDeviceId(logicalDeviceId);
  const query = activityQuery(input);
  const record = object(value, ['logicalDeviceId', 'from', 'to', 'items', 'nextCursor', 'retention', 'timeBasis', 'source']);
  assert(record['logicalDeviceId'] === logicalDeviceId && record['from'] === query.from && record['to'] === query.to
    && record['timeBasis'] === 'serverRecordedAt' && record['source'] === 'broker-command'
    && Array.isArray(record['items']) && record['items'].length <= query.limit);
  const retention = object(record['retention'], ['maxAgeMs']);
  assert(retention['maxAgeMs'] === ACTIVITY_MAX_AGE_MS);
  if (record['nextCursor'] !== null) cursor(record['nextCursor']);
  const items = record['items'].map(value => item(value, query));
  assert(new Set(items.map(value => value.id)).size === items.length
    && (record['nextCursor'] === null || items.length > 0) && record['nextCursor'] !== query.before
    && items.every((value, index) => index === 0 || value.createdAt < items[index - 1].createdAt
      || value.createdAt === items[index - 1].createdAt && BigInt(value.id) < BigInt(items[index - 1].id)));
  return { logicalDeviceId, from: query.from, to: query.to, items, nextCursor: record['nextCursor'] as string | null,
    retention: { maxAgeMs: ACTIVITY_MAX_AGE_MS }, timeBasis: 'serverRecordedAt', source: 'broker-command' };
}
