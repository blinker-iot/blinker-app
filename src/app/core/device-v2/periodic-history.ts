import { parseHistoryStateValue, StateHistoryQuery, StateHistoryValue, stateHistoryDeviceId, stateHistoryQuery } from './state-history';

export const PERIODIC_HISTORY_INTERVAL_MS = 60000;
export const PERIODIC_HISTORY_MAX_FIELDS = 4;
export const PERIODIC_HISTORY_MAX_AGE_MS = 30 * 86400000;
export const PERIODIC_HISTORY_MAX_RECORDS = 200000;
export const PERIODIC_HISTORY_VIEW_LIMIT = 200;
export type PeriodicHistoryQuery = StateHistoryQuery;
export type PeriodicHistoryPhase = 'disabled' | 'waiting' | 'active' | 'capacity' | 'cadence' | 'unavailable'
  | 'storage-error' | 'source-error' | 'manifest-changed';
export interface PeriodicHistoryPolicy {
  revision: number; enabled: boolean; manifestFingerprint: string; keys: string[];
  intervalMs: 60000; updatedAt: number;
}
export interface PeriodicHistoryPolicyInput {
  expectedRevision: number; enabled: boolean; manifestFingerprint: string; keys: string[];
}
export interface PeriodicHistoryDetail {
  logicalDeviceId: string; manifestFingerprint: string | null; fields: { key: string; type: number }[];
  policy: PeriodicHistoryPolicy | null; runtime: { phase: PeriodicHistoryPhase; failures: number };
  limits: { intervalMs: 60000; maxFields: 4; maxAgeMs: number; maxRecords: number };
  timeBasis: 'serverReceivedAt'; timeQuality: 'receipt-only'; source: 'broker-telemetry'; canConfigure: boolean;
}
export interface PeriodicHistoryItem {
  id: string; segmentId: string; key: string; type: number; state: StateHistoryValue;
  policyRevision: number; manifestFingerprint: string; streamId: number; epoch: number; sampleSequence: number;
  monotonicMs: number; effectiveIntervalMs: number; receivedAt: number;
}
export interface PeriodicHistoryPage {
  logicalDeviceId: string; from: number; to: number; items: PeriodicHistoryItem[]; nextCursor: string | null;
  retention: { maxAgeMs: number; maxRecords: number }; source: 'broker-telemetry'; timeBasis: 'serverReceivedAt';
  timeQuality: 'receipt-only'; recordedTypes: number[];
}
const assert: (ok: unknown) => asserts ok = ok => { if (!ok) throw Error('PERIODIC_HISTORY_RESPONSE_INVALID'); };
function object(value: unknown, fields: string[]): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  assert(Object.keys(record).length === fields.length && fields.every(key => Object.hasOwn(record, key)));
  return record;
}
function uint(value: unknown, minimum = 1, maximum = 0xffffffff): asserts value is number {
  assert(Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum);
}
function time(value: unknown): asserts value is number { assert(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 8640000000000000); }
function key(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).length <= 64
    && !value.includes('\0') && new TextDecoder().decode(new TextEncoder().encode(value)) === value);
}
function fingerprint(value: unknown): asserts value is string { assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)); }
function keys(value: unknown): asserts value is string[] {
  assert(Array.isArray(value) && value.length >= 1 && value.length <= PERIODIC_HISTORY_MAX_FIELDS);
  value.forEach(key); assert(new Set(value).size === value.length);
}
function source(record: Record<string, unknown>): void {
  assert(record['source'] === 'broker-telemetry' && record['timeBasis'] === 'serverReceivedAt' && record['timeQuality'] === 'receipt-only');
}
export function periodicHistoryPolicyInput(value: PeriodicHistoryPolicyInput): PeriodicHistoryPolicyInput {
  const record = object(value, ['expectedRevision', 'enabled', 'manifestFingerprint', 'keys']);
  uint(record['expectedRevision'], 0, 0xfffffffe); assert(typeof record['enabled'] === 'boolean');
  fingerprint(record['manifestFingerprint']); keys(record['keys']);
  return { expectedRevision: record['expectedRevision'], enabled: record['enabled'],
    manifestFingerprint: record['manifestFingerprint'], keys: [...record['keys']].sort() };
}
export function parsePeriodicHistoryDetail(value: unknown, id: string): PeriodicHistoryDetail {
  stateHistoryDeviceId(id);
  const record = object(value, ['logicalDeviceId', 'manifestFingerprint', 'fields', 'policy', 'runtime', 'limits',
    'timeBasis', 'timeQuality', 'source', 'canConfigure']);
  assert(record['logicalDeviceId'] === id && typeof record['canConfigure'] === 'boolean'); source(record);
  if (record['manifestFingerprint'] !== null) fingerprint(record['manifestFingerprint']);
  assert(Array.isArray(record['fields']) && record['fields'].length <= 256);
  const fields = record['fields'].map(value => {
    const field = object(value, ['key', 'type']); key(field['key']); uint(field['type'], 1, 4);
    return { key: field['key'], type: field['type'] };
  });
  assert(new Set(fields.map(field => field.key)).size === fields.length && (record['manifestFingerprint'] !== null || fields.length === 0));
  let policy: PeriodicHistoryPolicy | null = null;
  if (record['policy'] !== null) {
    const input = object(record['policy'], ['revision', 'enabled', 'manifestFingerprint', 'keys', 'intervalMs', 'updatedAt']);
    uint(input['revision']); assert(typeof input['enabled'] === 'boolean' && input['intervalMs'] === 60000);
    fingerprint(input['manifestFingerprint']); keys(input['keys']); time(input['updatedAt']);
    policy = { revision: input['revision'], enabled: input['enabled'], manifestFingerprint: input['manifestFingerprint'],
      keys: [...input['keys']], intervalMs: 60000, updatedAt: input['updatedAt'] };
  }
  const runtime = object(record['runtime'], ['phase', 'failures']); uint(runtime['failures'], 0, 65535);
  assert(['disabled', 'waiting', 'active', 'capacity', 'cadence', 'unavailable', 'storage-error', 'source-error', 'manifest-changed'].includes(String(runtime['phase'])));
  const limits = object(record['limits'], ['intervalMs', 'maxFields', 'maxAgeMs', 'maxRecords']);
  assert(limits['intervalMs'] === 60000 && limits['maxFields'] === 4
    && limits['maxAgeMs'] === PERIODIC_HISTORY_MAX_AGE_MS && limits['maxRecords'] === PERIODIC_HISTORY_MAX_RECORDS);
  return { logicalDeviceId: id, manifestFingerprint: record['manifestFingerprint'] as string | null, fields, policy,
    runtime: { phase: runtime['phase'] as PeriodicHistoryPhase, failures: runtime['failures'] },
    limits: { intervalMs: 60000, maxFields: 4, maxAgeMs: PERIODIC_HISTORY_MAX_AGE_MS, maxRecords: PERIODIC_HISTORY_MAX_RECORDS },
    timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', source: 'broker-telemetry', canConfigure: record['canConfigure'] };
}
export function parsePeriodicHistoryPage(value: unknown, id: string, input: PeriodicHistoryQuery): PeriodicHistoryPage {
  stateHistoryDeviceId(id); const query = stateHistoryQuery(input);
  const record = object(value, ['logicalDeviceId', 'from', 'to', 'items', 'nextCursor', 'retention', 'timeBasis', 'timeQuality', 'source', 'recordedTypes']);
  assert(record['logicalDeviceId'] === id && record['from'] === query.from && record['to'] === query.to); source(record);
  assert(JSON.stringify(record['recordedTypes']) === '[1,2,3,4]' && Array.isArray(record['items']) && record['items'].length <= query.limit);
  const retention = object(record['retention'], ['maxAgeMs', 'maxRecords']);
  assert(retention['maxAgeMs'] === PERIODIC_HISTORY_MAX_AGE_MS && retention['maxRecords'] === PERIODIC_HISTORY_MAX_RECORDS);
  if (record['nextCursor'] !== null) {
    assert(typeof record['nextCursor'] === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(record['nextCursor']) && record['nextCursor'] !== query.before);
    stateHistoryQuery({ ...query, before: record['nextCursor'] });
  }
  const items = record['items'].map(value => {
    const row = object(value, ['id', 'segmentId', 'key', 'type', 'state', 'policyRevision', 'manifestFingerprint',
      'streamId', 'epoch', 'sampleSequence', 'monotonicMs', 'effectiveIntervalMs', 'receivedAt']);
    assert(typeof row['id'] === 'string' && /^[1-9][0-9]{0,18}$/.test(row['id']) && BigInt(row['id']) <= 9223372036854775807n
      && typeof row['segmentId'] === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row['segmentId']));
    key(row['key']); uint(row['type'], 1, 4); fingerprint(row['manifestFingerprint']);
    for (const name of ['policyRevision', 'streamId', 'epoch', 'sampleSequence']) uint(row[name]);
    uint(row['monotonicMs'], 0); uint(row['effectiveIntervalMs'], 100, 60000); time(row['receivedAt']);
    assert(row['receivedAt'] >= query.from && row['receivedAt'] < query.to && (!query.key || row['key'] === query.key));
    return { ...row, state: parseHistoryStateValue(row['state'], row['key'], row['type']) } as unknown as PeriodicHistoryItem;
  });
  assert(new Set(items.map(row => row.id)).size === items.length && (record['nextCursor'] === null || items.length > 0)
    && items.every((row, index) => index === 0 || BigInt(row.id) < BigInt(items[index - 1].id)));
  return { logicalDeviceId: id, from: query.from, to: query.to, items, nextCursor: record['nextCursor'] as string | null,
    retention: { maxAgeMs: PERIODIC_HISTORY_MAX_AGE_MS, maxRecords: PERIODIC_HISTORY_MAX_RECORDS },
    source: 'broker-telemetry', timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', recordedTypes: [1, 2, 3, 4] };
}

// Receipt-time visualization only. Keep precise int64 text in the table rather
// than silently rounding it into a misleading curve; never bridge a gap/segment.
export function periodicHistoryCurves(rows: PeriodicHistoryItem[]) {
  const groups = new Map<string, PeriodicHistoryItem[]>();
  for (const row of rows.slice(0, PERIODIC_HISTORY_VIEW_LIMIT)) {
    const value = row.state.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const identity = JSON.stringify([row.key, row.type]);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity)!.push(row);
  }
  return [...groups.values()].map(values => {
    values.sort((a, b) => a.receivedAt - b.receivedAt || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const from = values[0].receivedAt, span = Math.max(1, values.at(-1)!.receivedAt - from);
    const numbers = values.map(row => row.state.value as number), min = Math.min(...numbers), max = Math.max(...numbers);
    const scale = Math.max(1, Math.abs(min), Math.abs(max));
    const low = min / scale, height = max / scale - low;
    const paths: string[] = [], dots: { x: number; y: number }[] = [];
    let previous: PeriodicHistoryItem | undefined;
    for (const row of values) {
      const x = 4 + (row.receivedAt - from) / span * 292;
      const y = height === 0 ? 50 : 96 - ((row.state.value as number) / scale - low) / height * 92;
      const continuous = previous && previous.segmentId === row.segmentId && previous.policyRevision === row.policyRevision
        && previous.manifestFingerprint === row.manifestFingerprint && previous.receivedAt < row.receivedAt
        && row.receivedAt - previous.receivedAt <= Math.max(180000, row.effectiveIntervalMs * 3);
      if (continuous) paths[paths.length - 1] += ` L${x},${y}`;
      else paths.push(`M${x},${y}`);
      dots.push({ x, y }); previous = row;
    }
    return { key: values[0].key, type: values[0].type, paths, dots, from, to: values.at(-1)!.receivedAt, min, max };
  });
}
