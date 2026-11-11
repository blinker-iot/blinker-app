import { base64UrlDecode } from '../base64url';

export type TaskSchedule = { kind: 'countdown'; durationMillis: number }
  | { kind: 'once'; utcMillis: number }
  | { kind: 'weekly'; minuteOfDay: number; utcOffsetMinutes: number; weekdays: number };
export interface TaskDefinition {
  schedule: TaskSchedule; enabled: boolean; key: string;
  valueType: 'boolean' | 'int' | 'uint' | 'float32' | 'float64'; value: boolean | number;
}
export type TaskIntent = { operation: 'initialize' }
  | { operation: 'read'; expectedRevision: number; index: number | null }
  | { operation: 'catalog'; fingerprint: string | null; index: number | null }
  | { operation: 'create'; expectedRevision: number; definition: TaskDefinition }
  | { operation: 'replace'; expectedRevision: number; taskId: number; definition: TaskDefinition }
  | { operation: 'remove' | 'start'; expectedRevision: number; taskId: number }
  | { operation: 'enable'; expectedRevision: number; taskId: number; enabled: boolean };
export type TaskRequest = TaskIntent & { contract: 'device-tasks/1'; requestId: string };
export interface TaskRecord {
  taskId: number; definitionRevision: number; consumedUtcMillis: number;
  startSequence: number; progress: number; definition: TaskDefinition;
}
export type TaskResult = { kind: 'authority' | 'metadata'; tableRevision: number; count: number }
  | { kind: 'mutation'; tableRevision: number; count: number; taskId: number; replayed: boolean }
  | { kind: 'record'; tableRevision: number; count: number; index: number; record: TaskRecord }
  | { kind: 'catalog'; tableRevision: number; count: number; capacity: number; total: number; fingerprint: string }
  | { kind: 'target'; tableRevision: number; count: number; capacity: number; total: number; fingerprint: string;
      index: number; key: string; valueType: TaskDefinition['valueType'] };
export interface TaskCatalog {
  capacity: number; fingerprint: string;
  targets: ReadonlyArray<{ key: string; valueType: TaskDefinition['valueType'] }>;
}
export interface TaskResponse {
  contract: 'device-tasks/1'; logicalDeviceId: string; requestId: string; state: 'verified';
  evidence: 'fresh' | 'historical'; result: TaskResult | null;
}

function requireValue(ok: unknown): asserts ok { if (!ok) throw new Error('TASK_CONTRACT_INVALID'); }
function exact(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k)));
}
function integer(v: unknown, max = 0xffffffff, min = 0): asserts v is number {
  requireValue(typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max && !Object.is(v, -0));
}
export function taskDeviceId(id: string): void { requireValue(typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)); }
function targetKey(key: unknown): asserts key is string {
  requireValue(typeof key === 'string' && key.length > 0 && !key.includes('\0')
    && new TextEncoder().encode(key).length <= 64 && new TextDecoder().decode(new TextEncoder().encode(key)) === key);
}
function fingerprint(value: unknown): asserts value is string {
  requireValue(typeof value === 'string' && value.length === 43); base64UrlDecode(value, 32);
}
export function taskDefinition(value: unknown): TaskDefinition {
  exact(value, ['schedule', 'enabled', 'key', 'valueType', 'value']);
  const s = value['schedule'];
  requireValue(s && typeof s === 'object' && 'kind' in s);
  let schedule: TaskSchedule;
  if (s['kind'] === 'countdown') { exact(s, ['kind', 'durationMillis']); integer(s['durationMillis'], 0x7fffffff, 1); schedule = { kind: 'countdown', durationMillis: s['durationMillis'] }; }
  else if (s['kind'] === 'once') { exact(s, ['kind', 'utcMillis']); integer(s['utcMillis'], 4102444799999, 946684800000); schedule = { kind: 'once', utcMillis: s['utcMillis'] }; }
  else {
    exact(s, ['kind', 'minuteOfDay', 'utcOffsetMinutes', 'weekdays']); requireValue(s['kind'] === 'weekly');
    integer(s['minuteOfDay'], 1439); integer(s['utcOffsetMinutes'], 840, -720); integer(s['weekdays'], 127, 1);
    schedule = { kind: 'weekly', minuteOfDay: s['minuteOfDay'], utcOffsetMinutes: s['utcOffsetMinutes'], weekdays: s['weekdays'] };
  }
  requireValue(typeof value['enabled'] === 'boolean'); targetKey(value['key']);
  const type = value['valueType'], scalar = value['value'];
  if (type === 'boolean') requireValue(typeof scalar === 'boolean');
  else if (type === 'int' || type === 'uint') integer(scalar, Number.MAX_SAFE_INTEGER, type === 'int' ? -Number.MAX_SAFE_INTEGER : 0);
  else {
    requireValue((type === 'float32' || type === 'float64') && typeof scalar === 'number' && Number.isFinite(scalar)
      && !Object.is(scalar, -0) && (type !== 'float32' || Math.fround(scalar) === scalar));
  }
  return { schedule, enabled: value['enabled'], key: value['key'], valueType: type as TaskDefinition['valueType'], value: scalar as boolean | number };
}

// Normalize owned JSON, not BBP/CBOR or an authorization provider. Exact fields
// prevent authority/secret metadata from entering the persisted user intent.
export function taskRequest(value: unknown): TaskRequest {
  requireValue(value && typeof value === 'object');
  const v = value as Record<string, unknown>, common = ['contract', 'requestId', 'operation'];
  requireValue(v['contract'] === 'device-tasks/1' && typeof v['requestId'] === 'string' && v['requestId'].length === 22);
  base64UrlDecode(v['requestId'], 16);
  const head = { contract: 'device-tasks/1' as const, requestId: v['requestId'] };
  if (v['operation'] === 'initialize') { exact(v, common); return { ...head, operation: 'initialize' }; }
  if (v['operation'] === 'catalog') {
    exact(v, [...common, 'fingerprint', 'index']);
    if (v['index'] === null) requireValue(v['fingerprint'] === null);
    else { integer(v['index'], 31); fingerprint(v['fingerprint']); }
    return { ...head, operation: 'catalog', fingerprint: v['fingerprint'] as string | null, index: v['index'] as number | null };
  }
  integer(v['expectedRevision']);
  if (v['operation'] === 'read') {
    exact(v, [...common, 'expectedRevision', 'index']);
    if (v['index'] === null) requireValue(v['expectedRevision'] === 0); else integer(v['index'], 0xfffffffe);
    return { ...head, operation: 'read', expectedRevision: v['expectedRevision'], index: v['index'] as number | null };
  }
  const fields = [...common, 'expectedRevision'];
  if (v['operation'] !== 'create') { fields.push('taskId'); integer(v['taskId'], 0xffffffff, 1); }
  if (v['operation'] === 'create' || v['operation'] === 'replace') {
    exact(v, [...fields, 'definition']);
    return { ...head, operation: v['operation'], expectedRevision: v['expectedRevision'],
      ...(v['operation'] === 'replace' ? { taskId: v['taskId'] as number } : {}), definition: taskDefinition(v['definition']) } as TaskRequest;
  }
  if (v['operation'] === 'enable') {
    exact(v, [...fields, 'enabled']); requireValue(typeof v['enabled'] === 'boolean');
    return { ...head, operation: 'enable', expectedRevision: v['expectedRevision'], taskId: v['taskId'] as number, enabled: v['enabled'] };
  }
  exact(v, fields); requireValue(v['operation'] === 'remove' || v['operation'] === 'start');
  return { ...head, operation: v['operation'], expectedRevision: v['expectedRevision'], taskId: v['taskId'] as number };
}

export function taskResponse(value: unknown, id: string, request: TaskRequest): TaskResponse {
  exact(value, ['contract', 'logicalDeviceId', 'requestId', 'state', 'evidence', 'result']);
  requireValue(value['contract'] === 'device-tasks/1' && value['logicalDeviceId'] === id && value['requestId'] === request.requestId);
  if (value['state'] === 'rejected') {
    const r = value['result'];
    exact(r, ['kind', 'tableRevision', 'count', 'reason']);
    requireValue(value['evidence'] === 'fresh' && r['kind'] === 'rejection'
      && request.operation !== 'initialize' && request.operation !== 'read' && request.operation !== 'catalog');
    integer(r['tableRevision']); integer(r['count'], 10);
    requireValue(r['tableRevision'] === request.expectedRevision && (r['tableRevision'] !== 0 || r['count'] === 0)
      && (r['reason'] === 'write-budget' || (r['reason'] === 'start-cooldown' && request.operation === 'start')));
    // Throw before the client's success/journal-clear path. Only this attempt
    // was refused: a prior attempt of the same request can still be unknown.
    throw new Error(r['reason'] === 'write-budget' ? 'TASK_ATTEMPT_WRITE_BUDGET' : 'TASK_ATTEMPT_START_COOLDOWN');
  }
  requireValue(value['state'] === 'verified');
  if (value['evidence'] === 'historical') { requireValue(value['result'] === null); return value as unknown as TaskResponse; }
  requireValue(value['evidence'] === 'fresh' && value['result'] && typeof value['result'] === 'object');
  const r = value['result'] as Record<string, unknown>, fields = ['kind', 'tableRevision', 'count'];
  integer(r['tableRevision']); integer(r['count'], 10);
  requireValue(r['tableRevision'] !== 0 || r['count'] === 0);
  if (request.operation === 'initialize') { exact(r, fields); requireValue(r['kind'] === 'authority'); }
  else if (request.operation === 'catalog') {
    const metadata = request.index === null;
    exact(r, [...fields, 'capacity', 'total', 'fingerprint', ...(metadata ? [] : ['index', 'key', 'valueType'])]);
    requireValue(r['kind'] === (metadata ? 'catalog' : 'target'));
    integer(r['capacity'], 10, 1); integer(r['total'], 32); fingerprint(r['fingerprint']);
    requireValue(r['count'] <= r['capacity']);
    if (!metadata) {
      requireValue(r['fingerprint'] === request.fingerprint && r['index'] === request.index);
      integer(r['index'], r['total'] - 1); targetKey(r['key']);
      requireValue(['boolean', 'int', 'uint', 'float32', 'float64'].includes(r['valueType'] as string));
    }
  }
  else if (request.operation === 'read' && request.index === null) { exact(r, fields); requireValue(r['kind'] === 'metadata'); }
  else if (request.operation === 'read') {
    exact(r, [...fields, 'index', 'record']); requireValue(r['kind'] === 'record' && r['index'] === request.index && r['tableRevision'] === request.expectedRevision);
    const record = r['record'];
    exact(record, ['taskId', 'definitionRevision', 'consumedUtcMillis', 'startSequence', 'progress', 'definition']);
    integer(r['index'], r['count'] - 1);
    integer(record['taskId'], 0xfffffffe, 1); integer(record['definitionRevision'], r['tableRevision'], 1);
    integer(record['consumedUtcMillis'], Number.MAX_SAFE_INTEGER); integer(record['startSequence']); integer(record['progress'], 6);
    taskDefinition(record['definition']);
  } else {
    exact(r, [...fields, 'taskId', 'replayed']);
    requireValue(r['kind'] === 'mutation' && r['tableRevision'] === request.expectedRevision + 1 && typeof r['replayed'] === 'boolean');
    integer(r['taskId'], 0xfffffffe, 1); if (request.operation !== 'create') requireValue(r['taskId'] === request.taskId);
  }
  return JSON.parse(JSON.stringify(value)) as TaskResponse;
}
