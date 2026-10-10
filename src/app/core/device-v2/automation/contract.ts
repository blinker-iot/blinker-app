export type AutomationScalarType = 'boolean' | 'int32' | 'uint32' | 'float32' | 'float64';
export type AutomationCondition = { kind: 'boolean-edge'; direction: 'rising' | 'falling' }
  | { kind: 'numeric-threshold'; direction: 'above' | 'below'; threshold: number; hysteresis: number };
export interface AutomationEndpoint { deviceId: string; key: string; fingerprint: string; valueType: AutomationScalarType; }
export interface AutomationBooleanEndpoint extends AutomationEndpoint { valueType: 'boolean'; }
export interface AutomationTargetEndpoint extends AutomationBooleanEndpoint { value: boolean; }
interface AutomationWriteFields { expectedRevision: number; enabled: boolean; target: AutomationTargetEndpoint; }
export interface AutomationWriteV1 extends AutomationWriteFields { source: AutomationBooleanEndpoint; }
export interface AutomationWriteV2 extends AutomationWriteFields { source: AutomationEndpoint; policyVersion: 2; condition: AutomationCondition; }
export type AutomationWrite = AutomationWriteV1 | AutomationWriteV2;
export type AutomationIntent = { ruleId: string; operation: 'put'; body: AutomationWrite }
  | { ruleId: string; operation: 'retire'; body: { expectedRevision: number } };
export type AutomationStatus = 'disabled' | 'waiting-baseline' | 'observing' | 'paused' | 'execution-unknown' | 'retired';
interface AutomationRuleFields {
  ruleId: string; definitionRevision: number; enabled: boolean; target: AutomationTargetEndpoint;
  status: AutomationStatus; targetOutcomeUnknown: boolean; retiredAtMs: number | null; updatedAtMs: number;
}
export interface AutomationRuleV1 extends AutomationRuleFields { source: AutomationBooleanEndpoint; condition: 'rising-boolean'; policyVersion: 1; }
export interface AutomationRuleV2 extends AutomationRuleFields { source: AutomationEndpoint; condition: AutomationCondition; policyVersion: 2; }
export type AutomationRule = AutomationRuleV1 | AutomationRuleV2;
export interface AutomationExecution { executionId: string; definitionRevision: number; state: 'prepared' | 'dispatching'
  | 'acknowledged' | 'rejected' | 'outcome_unknown' | 'expired' | 'cancelled'; createdAtMs: number; updatedAtMs: number; }
export interface AutomationDetail { rule: AutomationRule; recentExecutions: AutomationExecution[]; }
export interface AutomationPage { rules: AutomationRule[]; nextAfter: string | null; }
export const automationAssert: (ok: unknown, code?: string) => asserts ok = (ok, code = 'AUTOMATION_RESPONSE_INVALID') => {
  if (!ok) throw new Error(code);
};
export function automationId(v: unknown): asserts v is string {
  automationAssert(typeof v === 'string' && v.length > 0 && v.length <= 128 && !/[^A-Za-z0-9_-]/.test(v));
}
function exact(v: any, keys: string[]): void {
  automationAssert(v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
}
function integer(v: unknown, min = 0): void { automationAssert(Number.isSafeInteger(v) && !Object.is(v, -0) && (v as number) >= min); }
export function automationCondition(raw: unknown): AutomationCondition {
  const v = raw as any;
  if (v?.kind === 'boolean-edge') {
    exact(v, ['kind', 'direction']); automationAssert(['rising', 'falling'].includes(v.direction));
    return { kind: v.kind, direction: v.direction };
  }
  automationAssert(v?.kind === 'numeric-threshold'); exact(v, ['kind', 'direction', 'threshold', 'hysteresis']);
  automationAssert(['above', 'below'].includes(v.direction) && typeof v.threshold === 'number' && Number.isFinite(v.threshold)
    && !Object.is(v.threshold, -0) && typeof v.hysteresis === 'number' && Number.isFinite(v.hysteresis) && v.hysteresis > 0);
  const reset = v.direction === 'above' ? v.threshold - v.hysteresis : v.threshold + v.hysteresis;
  automationAssert(Number.isFinite(reset) && (v.direction === 'above' ? reset < v.threshold : reset > v.threshold));
  return { kind: v.kind, direction: v.direction, threshold: v.threshold, hysteresis: v.hysteresis };
}
function conditionMatchesSource(condition: AutomationCondition, source: AutomationEndpoint): void {
  automationAssert((condition.kind === 'boolean-edge') === (source.valueType === 'boolean'));
}
function endpoint(v: any, target: boolean, typed = false): AutomationEndpoint & { value?: boolean } {
  exact(v, ['deviceId','key','fingerprint','valueType', ...(target ? ['value'] : [])]); automationId(v.deviceId);
  automationAssert(typeof v.key === 'string' && v.key.length > 0 && new TextEncoder().encode(v.key).length <= 64
    && !/[\u0000-\u001f\u007f]/.test(v.key) && new TextDecoder().decode(new TextEncoder().encode(v.key)) === v.key);
  automationAssert(typeof v.fingerprint === 'string' && v.fingerprint.length === 64 && !/[^a-f0-9]/.test(v.fingerprint)
    && (typed && !target ? ['boolean', 'int32', 'uint32', 'float32', 'float64'].includes(v.valueType) : v.valueType === 'boolean')
    && (!target || typeof v.value === 'boolean'));
  return { ...v };
}
export function automationIntent(raw: unknown): AutomationIntent {
  const v = raw as any; exact(v, ['ruleId', 'operation', 'body']); automationId(v.ruleId);
  automationAssert(v.operation === 'put' || v.operation === 'retire');
  const typed = v.operation === 'put' && v.body && (Object.hasOwn(v.body, 'policyVersion') || Object.hasOwn(v.body, 'condition'));
  exact(v.body, v.operation === 'put' ? ['expectedRevision', 'enabled', 'source', 'target',
    ...(typed ? ['policyVersion', 'condition'] : [])] : ['expectedRevision']);
  integer(v.body.expectedRevision, v.operation === 'put' ? 0 : 1);
  automationAssert(v.body.expectedRevision < Number.MAX_SAFE_INTEGER);
  if (v.operation === 'retire') return { ruleId: v.ruleId, operation: v.operation, body: { ...v.body } };
  if (typed) automationAssert(v.body.policyVersion === 2);
  const source = endpoint(v.body.source, false, typed), target = endpoint(v.body.target, true) as AutomationTargetEndpoint;
  automationAssert(source.deviceId !== target.deviceId && typeof v.body.enabled === 'boolean'
    && (v.body.expectedRevision !== 0 || v.body.enabled === false));
  const body = { expectedRevision: v.body.expectedRevision, enabled: v.body.enabled, source, target };
  if (typed) {
    const condition = automationCondition(v.body.condition); conditionMatchesSource(condition, source);
    return { ruleId: v.ruleId, operation: 'put', body: { ...body, policyVersion: 2, condition } };
  }
  return { ruleId: v.ruleId, operation: 'put', body: { ...body, source: source as AutomationBooleanEndpoint } };
}
function rule(raw: any): AutomationRule {
  exact(raw, ['ruleId','definitionRevision','enabled','source','target','condition','policyVersion','status','targetOutcomeUnknown','retiredAtMs','updatedAtMs']);
  automationId(raw.ruleId); integer(raw.definitionRevision, 1); integer(raw.updatedAtMs);
  automationAssert(raw.policyVersion === 1 || raw.policyVersion === 2);
  const source = endpoint(raw.source, false, raw.policyVersion === 2), target = endpoint(raw.target, true);
  const condition = raw.policyVersion === 2 ? automationCondition(raw.condition) : raw.condition;
  if (raw.policyVersion === 2) conditionMatchesSource(condition, source);
  else automationAssert(condition === 'rising-boolean');
  automationAssert(source.deviceId !== target.deviceId && typeof raw.enabled === 'boolean' && typeof raw.targetOutcomeUnknown === 'boolean'
    && ['disabled','waiting-baseline','observing','paused','execution-unknown','retired'].includes(raw.status));
  if (raw.retiredAtMs !== null) { integer(raw.retiredAtMs); automationAssert(!raw.enabled && raw.status === 'retired' && raw.retiredAtMs <= raw.updatedAtMs); }
  else automationAssert(raw.status !== 'retired' && (raw.enabled ? raw.status !== 'disabled' : raw.status === 'disabled'));
  automationAssert(raw.status !== 'execution-unknown' || raw.targetOutcomeUnknown);
  return { ...raw, source, target, condition };
}
export function automationDetail(raw: any, ruleId: string): AutomationDetail {
  exact(raw, ['rule','recentExecutions']); const value = rule(raw.rule); automationAssert(value.ruleId === ruleId);
  automationAssert(Array.isArray(raw.recentExecutions) && raw.recentExecutions.length <= 16);
  const ids = new Set<string>();
  const recentExecutions = raw.recentExecutions.map((r: any) => {
    exact(r, ['executionId','definitionRevision','state','createdAtMs','updatedAtMs']); automationId(r.executionId);
    integer(r.definitionRevision, 1); integer(r.createdAtMs); integer(r.updatedAtMs);
    automationAssert(!ids.has(r.executionId) && r.updatedAtMs >= r.createdAtMs && r.definitionRevision <= value.definitionRevision
      && ['prepared','dispatching','acknowledged','rejected','outcome_unknown','expired','cancelled'].includes(r.state));
    ids.add(r.executionId); return { ...r };
  });
  return { rule: value, recentExecutions };
}
export function automationPage(raw: any): AutomationPage {
  exact(raw, ['rules','nextAfter']); automationAssert(Array.isArray(raw.rules) && raw.rules.length <= 16);
  const rules = raw.rules.map(rule);
  automationAssert(new Set(rules.map(r => r.ruleId)).size === rules.length);
  if (raw.nextAfter !== null) { automationId(raw.nextAfter); automationAssert(rules.length === 16 && rules.at(-1)?.ruleId === raw.nextAfter); }
  return { rules, nextAfter: raw.nextAfter };
}
export function automationWriteOutcome(intent: AutomationIntent, value: AutomationRule): 'confirmed' | 'changed' | 'unresolved' {
  if (value.ruleId !== intent.ruleId || value.definitionRevision <= intent.body.expectedRevision) return 'unresolved';
  if (value.definitionRevision === intent.body.expectedRevision + 1) {
    if (intent.operation === 'retire' && value.status === 'retired') return 'confirmed';
    const body = intent.body;
    const sameCondition = intent.operation === 'put' && ('policyVersion' in body
      ? value.policyVersion === 2 && body.policyVersion === 2 && value.condition.kind === body.condition.kind
        && value.condition.direction === body.condition.direction
        && (body.condition.kind === 'boolean-edge' || value.condition.kind === 'numeric-threshold'
          && value.condition.threshold === body.condition.threshold && value.condition.hysteresis === body.condition.hysteresis)
      : value.policyVersion === 1 && value.condition === 'rising-boolean');
    if (intent.operation === 'put' && sameCondition && value.retiredAtMs === null && value.enabled === intent.body.enabled
      && ['deviceId','key','fingerprint','valueType'].every(k => value.source[k] === intent.body.source[k] && value.target[k] === intent.body.target[k])
      && value.target.value === intent.body.target.value) return 'confirmed';
  }
  return 'changed'; // A newer definition is not proof that OUR write committed.
}
export function automationErrorCode(e: any): string { return e?.code ?? e?.error?.errorCode ?? e?.message ?? ''; }
// Only for the FIRST attempt: these management errors occur before commit (or
// inside a rolled-back transaction). 403/404/503 may occur in the post-commit
// detail read. A rejected later retry never disproves an earlier unknown write.
export function automationInitialWriteRejected(error: unknown): boolean {
  const e = error as any, status = e?.httpStatus ?? e?.status, code = automationErrorCode(e);
  const suffix = typeof code === 'string' && code.startsWith('AUTOMATION_') ? code.slice(11) : '';
  if (status === 400) return ['INVALID_INPUT', 'SELF_EDGE', 'CREATE_DISABLED'].includes(suffix);
  if (status === 405) return suffix === 'METHOD_NOT_ALLOWED';
  if (status === 429) return suffix === 'RATE_LIMITED';
  return status === 409 && ['REVISION', 'RETIRED', 'ENDPOINT_CHANGED', 'IDEMPOTENCY_CONFLICT',
    'CAPACITY', 'STORAGE_CAPACITY', 'DUPLICATE_RULE', 'TARGET_CONFLICT', 'CHAIN_FORBIDDEN', 'PROFILE',
    'ROUTE_CHANGED', 'CREDENTIAL_CHANGED', 'SESSION_CHANGED', 'CAPABILITY_REQUIRED', 'CAPABILITY_CHANGED', 'STALE', 'UNSUPPORTED_VERSION'].includes(suffix);
}
