import { AutomationClient } from './client';
import { AutomationCondition, AutomationDetail, AutomationIntent, AutomationScalarType, AutomationWriteV2,
  automationCondition, automationDetail, automationIntent, automationName, automationPage, automationWriteOutcome } from './contract';
const source = { deviceId: 'source', key: 'power', fingerprint: 'ab'.repeat(32), valueType: 'boolean' as const };
const intent: AutomationIntent = { ruleId: 'rule-one', operation: 'put', body: { expectedRevision: 0, enabled: false,
  source, target: { ...source, deviceId: 'target', value: true } } };
function detail(revision = 1): AutomationDetail {
  return { rule: { ruleId: intent.ruleId, definitionRevision: revision, enabled: false, source: { ...source }, target: { ...source, deviceId: 'target', value: true },
    condition: 'rising-boolean', policyVersion: 1, status: 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 100 }, recentExecutions: [] };
}
function typedIntent(valueType: AutomationScalarType = 'float32', condition: AutomationCondition = {
  kind: 'numeric-threshold', direction: 'above', threshold: 30, hysteresis: 2,
}, expectedRevision = 0): AutomationIntent & { operation: 'put'; body: AutomationWriteV2 } {
  return { ruleId: 'typed-rule', operation: 'put', body: { expectedRevision, enabled: expectedRevision > 0,
    source: { ...source, key: 'temperature', valueType }, target: { ...source, deviceId: 'target', value: false }, policyVersion: 2, condition } };
}
function typedDetail(input = typedIntent(), revision = input.body.expectedRevision + 1): AutomationDetail {
  const { expectedRevision, ...body } = input.body;
  return { rule: { ...body, ruleId: input.ruleId, definitionRevision: revision,
    status: body.enabled ? 'observing' : 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 100 }, recentExecutions: [] };
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
function setup() {
  const values = new Map<string,string>(), scope = { authority: 'https://example.test', accountId: 'owner', sessionEpoch: 1 };
  const api = { list: vi.fn(async (_retired: boolean, _after: string | undefined, _signal: AbortSignal) => ({ rules: [detail().rule], nextAfter: null })),
    get: vi.fn(async (_id: string, _signal: AbortSignal) => detail()), write: vi.fn(async (_intent: AutomationIntent, _signal: AbortSignal) => detail()) };
  const storage = { getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn(async (key: string) => { values.delete(key); }) };
  const create = () => new AutomationClient(api, storage, () => scope), client = create(), signal = new AbortController().signal;
  return { api, storage, values, scope, create, client, signal };
}
describe('automation management contract and write recovery', () => {
  it('strictly admits public boolean rules and rejects authority/Action/unbounded responses', () => {
    expect(automationIntent(intent)).toEqual(intent); expect(automationDetail(detail(), intent.ruleId)).toEqual(detail());
    for (const change of [{ ownerId: 'forged' }, { body: { ...intent.body, workerFence: 2 } },
      { body: { ...intent.body, enabled: true } }, { body: { ...intent.body, expectedRevision: -0 } }, { ruleId: 'rule\n' }])
      expect(() => automationIntent({ ...intent, ...change })).toThrow();
    for (const patch of [{ source: { ...source, kind: 1 } }, { retiredAtMs: 1 }, { status: 'execution-unknown' }, { workerFence: 2 }])
      expect(() => automationDetail({ ...detail(), rule: { ...detail().rule, ...patch } }, intent.ruleId)).toThrow();
    expect(() => automationPage({ rules: Array.from({ length: 17 }, () => detail().rule), nextAfter: null })).toThrow();
    expect(() => automationPage({ rules: [detail().rule], nextAfter: 'cursor' })).toThrow();
    expect(() => automationDetail({ ...detail(), recentExecutions: [{ executionId: 'e', definitionRevision: 1, state: 'acknowledged', createdAtMs: 2, updatedAtMs: 1 }] }, intent.ruleId)).toThrow();
    expect(automationWriteOutcome(intent, detail(2).rule)).toBe('changed');
  });
  it('waits for durable commit before HTTP, freezes inputs and releases only confirmed writes', async () => {
    const f = setup(), saved = deferred<void>(), started = deferred<void>();
    f.storage.setItem.mockImplementation(async (key, value) => { f.values.set(key, value); started.resolve(); await saved.promise; });
    const mutable = structuredClone(intent), run = f.client.submit(mutable, f.signal); await started.promise;
    expect(f.api.write).not.toHaveBeenCalled(); mutable.body.expectedRevision = 4;
    await expect(f.client.submit({ ...intent, ruleId: 'other' }, f.signal)).rejects.toThrow('AUTOMATION_BUSY');
    saved.resolve(); await run; expect(f.api.write.mock.calls[0][0]).toEqual(intent); expect(await f.client.pending()).toEqual([]);
  });
  it('lost result survives recreation; read-only recover cannot send, exact retry queries first', async () => {
    const f = setup(); f.api.write.mockRejectedValueOnce(Error('lost response'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow(); expect(await f.create().pending()).toEqual([intent]);
    f.api.get.mockRejectedValue(Object.assign(Error('not found'), { code: 'AUTOMATION_NOT_FOUND' }));
    expect((await f.create().recover(intent.ruleId, false, f.signal)).outcome).toBe('unresolved'); expect(f.api.write).toHaveBeenCalledTimes(1);
    await expect(f.client.submit({ ...intent, ruleId: 'new-id' }, f.signal)).rejects.toThrow('AUTOMATION_PENDING_CREATE');
    const result = await f.client.recover(intent.ruleId, true, f.signal);
    expect(result.outcome).toBe('confirmed'); expect(f.api.write.mock.calls[1][0]).toEqual(intent);
    expect(f.api.get).toHaveBeenCalledTimes(2); expect(await f.client.pending()).toEqual([]);
  });
  it('fresh confirmed read clears local intent without any resend; advanced revisions require review', async () => {
    const f = setup(); f.api.write.mockRejectedValue(Error('unknown'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow();
    expect((await f.client.recover(intent.ruleId, false, f.signal)).outcome).toBe('confirmed'); expect(f.api.write).toHaveBeenCalledTimes(1);
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow(); f.api.get.mockResolvedValue(detail(3));
    expect((await f.client.recover(intent.ruleId, true, f.signal)).outcome).toBe('changed'); expect(f.api.write).toHaveBeenCalledTimes(2);
    expect(await f.client.pending()).toEqual([intent]); await f.client.acceptChanged(intent, f.signal);
    expect(await f.client.pending()).toEqual([]); expect(f.api.write).toHaveBeenCalledTimes(2);
  });
  it('pending create does not prevent stopping another existing rule, but cannot be silently abandoned', async () => {
    const f = setup(); f.api.write.mockRejectedValueOnce(Error('unknown')); await expect(f.client.submit(intent, f.signal)).rejects.toThrow();
    f.api.write.mockResolvedValue({ ...detail(2), rule: { ...detail(2).rule, ruleId: 'other', status: 'retired', retiredAtMs: 100 } });
    await f.client.submit({ ruleId: 'other', operation: 'retire', body: { expectedRevision: 1 } }, f.signal);
    expect(await f.client.pending()).toEqual([intent]);
    f.api.get.mockResolvedValue(detail());
    const modified = { ...intent, body: { ...intent.body, expectedRevision: 1 } };
    await expect(f.client.acceptChanged(modified, f.signal)).rejects.toThrow('AUTOMATION_PENDING_CHANGED');
    expect(await f.client.pending()).toEqual([intent]);
  });
  it('storage failures deny sending; failed cleanup keeps the original intent; corruption does not reset history', async () => {
    const f = setup(); f.storage.setItem.mockRejectedValueOnce(Error('storage failed'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow(); expect(f.api.write).not.toHaveBeenCalled();
    f.storage.removeItem.mockRejectedValueOnce(Error('cleanup failed'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow(); expect(await f.client.pending()).toEqual([intent]);
    await f.client.recover(intent.ruleId, false, f.signal); expect(f.api.write).toHaveBeenCalledTimes(1);
    f.storage.getItem.mockResolvedValueOnce('corrupt'); await expect(f.client.submit(intent, f.signal)).rejects.toThrow('AUTOMATION_JOURNAL_INVALID');
    f.storage.getItem.mockResolvedValueOnce(JSON.stringify(Array.from({ length: 17 }, (_, i) => ({ ...intent, ruleId: `r-${i}` }))));
    await expect(f.client.pending()).rejects.toThrow('AUTOMATION_JOURNAL_INVALID');
  });
  it('a definitive first rejection releases only its intent; a later rejection cannot disprove an unknown attempt', async () => {
    const f = setup(), denied = Object.assign(Error('conflict'), { httpStatus: 409, code: 'AUTOMATION_CAPABILITY_CHANGED' });
    f.api.write.mockRejectedValueOnce(denied);
    await expect(f.client.submit(intent, f.signal)).rejects.toBe(denied);
    expect(await f.client.pending()).toEqual([]);
    f.api.write.mockRejectedValueOnce(Error('response lost'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow();
    f.api.get.mockRejectedValue(Object.assign(Error('absent'), { code: 'AUTOMATION_NOT_FOUND' }));
    f.api.write.mockRejectedValue(denied);
    await expect(f.client.recover(intent.ruleId, true, f.signal)).rejects.toBe(denied);
    expect(await f.client.pending()).toEqual([intent]);
  });
  it('post-commit read/transport/unrecognized errors never clear history, and rejected-write cleanup must commit', async () => {
    for (const [httpStatus, code] of [[403, 'AUTOMATION_FORBIDDEN'], [404, 'AUTOMATION_NOT_FOUND'],
      [503, 'AUTOMATION_UNAVAILABLE'], [409, 'AUTOMATION_NEW_ERROR'], [0, 'AUTOMATION_REVISION']]) {
      const f = setup(); f.api.write.mockRejectedValue(Object.assign(Error('denied'), { httpStatus, code }));
      await expect(f.client.submit(intent, f.signal)).rejects.toThrow(); expect(await f.client.pending()).toEqual([intent]);
    }
    const f = setup(); f.api.write.mockRejectedValue(Object.assign(Error('denied'), { httpStatus: 429, code: 'AUTOMATION_RATE_LIMITED' }));
    f.storage.removeItem.mockRejectedValue(Error('cleanup failed'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow('cleanup failed'); expect(await f.client.pending()).toEqual([intent]);
  });
  it('abort/account change during durable write cannot send under the new account and leaves origin journal', async () => {
    for (const changeAccount of [false, true]) {
      const f = setup(), controller = new AbortController(), original = f.storage.setItem.getMockImplementation()!;
      f.storage.setItem.mockImplementation(async (key, value) => { await original(key, value); if (changeAccount) f.scope.accountId = 'other'; else controller.abort(); });
      await expect(f.client.submit(intent, controller.signal)).rejects.toThrow(); expect(f.api.write).not.toHaveBeenCalled();
      if (changeAccount) { expect(await f.client.pending()).toEqual([]); f.scope.accountId = 'owner'; }
      expect(await f.client.pending()).toEqual([intent]);
    }
  });
  it('account epoch change during response discards late success without erasing its journal', async () => {
    const f = setup(); f.api.write.mockImplementation(async () => { f.scope.sessionEpoch++; return detail(); });
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow('AUTOMATION_ACCOUNT_CHANGED');
    expect(await f.client.pending()).toEqual([intent]);
  });
});

describe('automation typed public contract and exact journal recovery', () => {
  it('keeps V1 exact four-field bytes and accepts only the six-field closed V2 source-condition union', () => {
    expect(JSON.stringify(automationIntent(intent))).toBe(JSON.stringify(intent));
    expect(Object.keys((automationIntent(intent) as any).body)).toEqual(['expectedRevision', 'enabled', 'source', 'target']);
    for (const valueType of ['int32', 'uint32', 'float32', 'float64'] as const) for (const direction of ['above', 'below'] as const) {
      const input = typedIntent(valueType, { kind: 'numeric-threshold', direction, threshold: 30, hysteresis: 2 });
      expect(automationIntent(input)).toEqual(input);
      expect(Object.keys((automationIntent(input) as any).body)).toEqual(['expectedRevision', 'enabled', 'source', 'target', 'policyVersion', 'condition']);
    }
    for (const direction of ['rising', 'falling'] as const)
      expect(automationIntent(typedIntent('boolean', { kind: 'boolean-edge', direction }))).toEqual(typedIntent('boolean', { kind: 'boolean-edge', direction }));
  });

  it('strictly rejects unknown versions, authority fields, type mismatch and unsafe threshold/backoff arithmetic', () => {
    const input = typedIntent();
    for (const body of [
      { ...input.body, policyVersion: 1 }, { ...input.body, policyVersion: 3 }, { ...input.body, policyVersion: '2' },
      { ...input.body, definitionDigest: 'ab'.repeat(32) }, { ...input.body, condition: undefined },
      { ...input.body, source: { ...input.body.source, valueType: 'boolean' } },
      { ...input.body, source: { ...input.body.source, valueType: 'number' } },
      { ...input.body, target: { ...input.body.target, valueType: 'float32', value: 1 } },
      { ...input.body, condition: { kind: 'boolean-edge', direction: 'falling' } },
      { ...input.body, condition: { kind: 'numeric-threshold', direction: 'above', threshold: -0, hysteresis: 2 } },
      { ...input.body, condition: { kind: 'numeric-threshold', direction: 'above', threshold: Number.MAX_VALUE, hysteresis: Number.MIN_VALUE } },
      { ...input.body, condition: { kind: 'numeric-threshold', direction: 'below', threshold: Number.MAX_VALUE, hysteresis: Number.MAX_VALUE } },
      { ...input.body, condition: { kind: 'numeric-threshold', direction: 'above', threshold: 30, hysteresis: 0 } },
      { ...input.body, condition: { kind: 'numeric-threshold', direction: 'above', threshold: NaN, hysteresis: 2 } },
      { ...input.body, condition: { kind: 'numeric-threshold', direction: 'above', threshold: 30, hysteresis: Infinity } },
      { ...input.body, condition: { kind: 'boolean-edge', direction: 'falling', expression: 'true' } },
    ]) expect(() => automationIntent({ ...input, body })).toThrow();
    const missing = { ...input.body } as any; delete missing.policyVersion;
    expect(() => automationIntent({ ...input, body: missing })).toThrow();
    expect(() => automationIntent({ ...intent, body: { ...intent.body, policyVersion: 1 } })).toThrow();
    expect(() => automationIntent({ ...typedIntent(), operation: 'retire' })).toThrow();
  });

  it('normalizes detached condition objects with exactly shared boundary mathematics, not a rule executor', () => {
    const raw = { hysteresis: 2, threshold: 30, direction: 'above', kind: 'numeric-threshold' };
    const normalized = automationCondition(raw);
    expect(normalized).toEqual({ kind: 'numeric-threshold', direction: 'above', threshold: 30, hysteresis: 2 });
    expect(normalized).not.toBe(raw); raw.threshold = 40; expect((normalized as any).threshold).toBe(30);
    expect(automationCondition({ kind: 'numeric-threshold', direction: 'above', threshold: Number.MIN_VALUE, hysteresis: Number.MIN_VALUE })).toEqual({
      kind: 'numeric-threshold', direction: 'above', threshold: Number.MIN_VALUE, hysteresis: Number.MIN_VALUE,
    });
    for (const raw of [null, 'rising-boolean', { kind: 'expression', source: 'true' },
      { kind: 'boolean-edge', direction: 'either' }, { kind: 'numeric-threshold', direction: 'above', threshold: 0, hysteresis: -0 }])
      expect(() => automationCondition(raw)).toThrow();
  });

  it('validates mixed V1/V2 responses and rejects unknown versions rather than coercing them to A1', () => {
    const typed = typedDetail(); expect(automationDetail(typed, typed.rule.ruleId)).toEqual(typed);
    expect(automationPage({ rules: [detail().rule, typed.rule], nextAfter: null }).rules).toHaveLength(2);
    const normalized = automationDetail(typed, typed.rule.ruleId); expect(normalized.rule.condition).not.toBe(typed.rule.condition);
    for (const patch of [{ policyVersion: 3 }, { policyVersion: '2' }, { condition: 'rising-boolean' },
      { condition: { kind: 'boolean-edge', direction: 'rising' } }, { definitionDigest: 'ab'.repeat(32) },
      { source: { ...typed.rule.source, valueType: 'unknown' } },
      { target: { ...typed.rule.target, valueType: 'float64', value: 1 } }])
      expect(() => automationDetail({ ...typed, rule: { ...typed.rule, ...patch } }, typed.rule.ruleId)).toThrow();
    expect(() => automationDetail({ ...detail(), rule: { ...detail().rule, policyVersion: 2 } }, intent.ruleId)).toThrow();
  });

  it('write outcome binds policy, direction, threshold, hysteresis and scalar type at the original CAS', () => {
    const input = typedIntent('float32', undefined, 2), same = typedDetail(input);
    expect(automationWriteOutcome(input, same.rule)).toBe('confirmed');
    expect(automationWriteOutcome(input, typedDetail(input, 2).rule)).toBe('unresolved');
    expect(automationWriteOutcome(input, typedDetail(input, 4).rule)).toBe('changed');
    for (const changed of [typedIntent('float64', undefined, 2),
      typedIntent('float32', { kind: 'numeric-threshold', direction: 'below', threshold: 30, hysteresis: 2 }, 2),
      typedIntent('float32', { kind: 'numeric-threshold', direction: 'above', threshold: 31, hysteresis: 2 }, 2),
      typedIntent('float32', { kind: 'numeric-threshold', direction: 'above', threshold: 30, hysteresis: 3 }, 2)])
      expect(automationWriteOutcome(input, typedDetail(changed).rule)).toBe('changed');
    const bool = typedIntent('boolean', { kind: 'boolean-edge', direction: 'rising' }), legacy = detail();
    legacy.rule.ruleId = bool.ruleId;
    expect(automationWriteOutcome(bool, legacy.rule)).toBe('changed');
    const falling = typedIntent('boolean', { kind: 'boolean-edge', direction: 'falling' });
    expect(automationWriteOutcome(bool, typedDetail(falling).rule)).toBe('changed');
    expect(automationWriteOutcome({ ...intent, ruleId: bool.ruleId }, typedDetail(bool).rule)).toBe('changed');
  });

  it('freezes all typed selectors and condition before durable storage or HTTP, keeping the original journal namespace', async () => {
    const f = setup(), input = typedIntent(), mutable = structuredClone(input), gate = deferred<void>(), entered = deferred<void>();
    f.api.write.mockResolvedValue(typedDetail(input));
    f.storage.setItem.mockImplementation(async (key, value) => { f.values.set(key, value); entered.resolve(); await gate.promise; });
    const running = f.client.submit(mutable, f.signal); await entered.promise;
    expect(f.api.write).not.toHaveBeenCalled();
    (mutable.body.condition as any).threshold = 40; mutable.body.source.key = 'changed'; mutable.body.expectedRevision = 4;
    expect([...f.values.keys()][0]).toContain('automation-v1:'); gate.resolve(); await running;
    expect(f.api.write.mock.calls[0][0]).toEqual(input); expect(await f.client.pending()).toEqual([]);
  });

  it('never reconstructs an unknown typed intent from a refreshed rule with changed condition', async () => {
    const f = setup(), input = typedIntent('float32', undefined, 2);
    f.api.write.mockRejectedValue(Error('lost response')); await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    const changed = typedIntent('float32', { kind: 'numeric-threshold', direction: 'above', threshold: 40, hysteresis: 3 }, 2);
    f.api.get.mockResolvedValue(typedDetail(changed));
    expect((await f.create().recover(input.ruleId, true, f.signal)).outcome).toBe('changed');
    expect(f.api.write).toHaveBeenCalledTimes(1); expect(await f.client.pending()).toEqual([input]);
    await expect(f.client.acceptChanged(changed, f.signal)).rejects.toThrow('AUTOMATION_PENDING_CHANGED');
    expect(await f.client.pending()).toEqual([input]); await f.client.acceptChanged(input, f.signal);
    expect(await f.client.pending()).toEqual([]); expect(f.api.write).toHaveBeenCalledTimes(1);
  });

  it('exact typed retry checks its returned rule and cannot falsely confirm a changed write response', async () => {
    const f = setup(), input = typedIntent('float32', undefined, 2), changed = typedIntent('float64', undefined, 2);
    f.api.write.mockRejectedValueOnce(Error('lost response')); await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    f.api.get.mockResolvedValue(typedDetail(input, 2)); f.api.write.mockResolvedValue(typedDetail(changed));
    const result = await f.create().recover(input.ruleId, true, f.signal);
    expect(result.outcome).toBe('changed'); expect(f.api.write.mock.calls[1][0]).toEqual(input);
    expect(await f.client.pending()).toEqual([input]);
    f.api.get.mockResolvedValue(typedDetail(input));
    expect((await f.client.recover(input.ruleId, false, f.signal)).outcome).toBe('confirmed'); expect(await f.client.pending()).toEqual([]);
  });

  it('a mismatched initial success response retains the typed journal until explicit matching read or review', async () => {
    const f = setup(), input = typedIntent(), changed = typedIntent('float32', { kind: 'numeric-threshold', direction: 'above', threshold: 31, hysteresis: 2 });
    f.api.write.mockResolvedValue(typedDetail(changed));
    await expect(f.client.submit(input, f.signal)).rejects.toThrow('AUTOMATION_WRITE_NOT_CONFIRMED');
    expect(await f.client.pending()).toEqual([input]); f.api.get.mockResolvedValue(typedDetail(input));
    expect((await f.client.recover(input.ruleId, false, f.signal)).outcome).toBe('confirmed'); expect(f.api.write).toHaveBeenCalledTimes(1);
  });

  it('preserves mixed V1/V2 journals in the original account namespace and rejects unknown journal versions without erasing', async () => {
    const f = setup(), input = typedIntent('float32', undefined, 2); f.api.write.mockRejectedValue(Error('unknown'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow(); await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    expect(await f.create().pending()).toEqual([intent, input]); expect(f.values.size).toBe(1);
    const [key, raw] = [...f.values][0]; expect(key).toContain('automation-v1:');
    const corrupted = JSON.parse(raw); corrupted[1].body.policyVersion = 3; f.values.set(key, JSON.stringify(corrupted));
    await expect(f.create().pending()).rejects.toThrow('AUTOMATION_JOURNAL_INVALID'); expect(f.values.get(key)).toBe(JSON.stringify(corrupted));
    f.values.set(key, raw); expect(await f.create().pending()).toEqual([intent, input]);
    await expect(f.client.submit(typedIntent(), f.signal)).rejects.toThrow('AUTOMATION_PENDING_INTENT');
  });

  it('typed first unsupported rejection is definitive, but unsupported retry cannot disprove a prior unknown commit', async () => {
    const f = setup(), input = typedIntent(), unsupported = Object.assign(Error('unsupported'), { httpStatus: 409, code: 'AUTOMATION_UNSUPPORTED_VERSION' });
    f.api.write.mockRejectedValueOnce(unsupported); await expect(f.client.submit(input, f.signal)).rejects.toBe(unsupported);
    expect(await f.client.pending()).toEqual([]);
    f.api.write.mockRejectedValueOnce(Error('lost response')); await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    f.api.get.mockRejectedValue(Object.assign(Error('not found'), { code: 'AUTOMATION_NOT_FOUND' })); f.api.write.mockRejectedValue(unsupported);
    await expect(f.create().recover(input.ruleId, true, f.signal)).rejects.toBe(unsupported); expect(await f.client.pending()).toEqual([input]);
  });

  it('abort or account change during typed durable commit cannot send and never migrates origin history', async () => {
    for (const changeAccount of [false, true]) {
      const f = setup(), input = typedIntent(), controller = new AbortController(), save = f.storage.setItem.getMockImplementation()!;
      f.storage.setItem.mockImplementation(async (key, value) => { await save(key, value); if (changeAccount) f.scope.accountId = 'other'; else controller.abort(); });
      await expect(f.client.submit(input, controller.signal)).rejects.toThrow(); expect(f.api.write).not.toHaveBeenCalled();
      if (changeAccount) { expect(await f.create().pending()).toEqual([]); f.scope.accountId = 'owner'; }
      expect(await f.create().pending()).toEqual([input]);
    }
  });

  it('late typed read with aborted signal or account epoch cannot confirm and clear its origin journal', async () => {
    for (const changeEpoch of [false, true]) {
      const f = setup(), input = typedIntent(), controller = new AbortController();
      f.api.write.mockRejectedValue(Error('unknown')); await expect(f.client.submit(input, f.signal)).rejects.toThrow();
      f.api.get.mockImplementation(async () => { if (changeEpoch) f.scope.sessionEpoch++; else controller.abort(); return typedDetail(input); });
      await expect(f.client.recover(input.ruleId, false, controller.signal)).rejects.toThrow();
      expect(await f.create().pending()).toEqual([input]); expect(f.api.write).toHaveBeenCalledTimes(1);
    }
  });
});

describe('automation optional name contract and recovery', () => {
  it('normalizes optional management names without adding fields to old intent or rule bodies', () => {
    for (const input of [intent, typedIntent()]) {
      const named = automationIntent({ ...input, body: { ...input.body, name: '  温度升高时打开风扇  ' } });
      expect(named.body).toEqual({ ...input.body, name: '温度升高时打开风扇' });
      const old = automationIntent(input);
      expect(Object.hasOwn(old.body, 'name')).toBe(false);
      expect(JSON.stringify(old)).toBe(JSON.stringify(input));
    }
    const named = { ...detail(), rule: { ...detail().rule, name: '开灯' } };
    expect(automationDetail(named, intent.ruleId)).toEqual(named);
    expect(automationPage({ rules: [named.rule, { ...typedDetail().rule, name: '温度提醒' }], nextAfter: null }).rules.map(r => r.name)).toEqual(['开灯', '温度提醒']);
    expect(Object.hasOwn(automationDetail(detail(), intent.ruleId).rule, 'name')).toBe(false);
  });

  it('uses a normalized UTF-16 bound, rejecting supplied empty/invalid/control names and retirement metadata', () => {
    expect(automationName('  ' + '😀'.repeat(40) + '  ')).toBe('😀'.repeat(40));
    expect(automationName('x'.repeat(80))).toBe('x'.repeat(80));
    for (const name of [undefined, null, 1, {}, '', '  ', 'x'.repeat(81), '😀'.repeat(41), '\nTitle', 'Title\t', 'Title\u007f', '\u0000', '\ud800', '\udfff']) {
      expect(() => automationName(name)).toThrow();
      expect(() => automationIntent({ ...intent, body: { ...intent.body, name } })).toThrow();
      expect(() => automationDetail({ ...detail(), rule: { ...detail().rule, name } }, intent.ruleId)).toThrow();
    }
    expect(() => automationIntent({ ruleId: 'rule-one', operation: 'retire', body: { expectedRevision: 1, name: '开灯' } })).toThrow();
  });

  it('requires a supplied name to match confirmation but keeps old nameless intents compatible', () => {
    for (const input of [intent, typedIntent()]) {
      const named = automationIntent({ ...input, body: { ...input.body, name: '开灯' } });
      const original = input === intent ? detail().rule : typedDetail().rule;
      const rule = { ...original, name: '开灯' };
      expect(automationWriteOutcome(named, rule)).toBe('confirmed');
      expect(automationWriteOutcome(named, original)).toBe('changed');
      expect(automationWriteOutcome(named, { ...rule, name: '其他名称' })).toBe('changed');
      expect(automationWriteOutcome(input, rule)).toBe('confirmed');
    }
  });

  it('retains an unknown named write when only its returned name differs, then confirms without resending', async () => {
    const f = setup(), input = typedIntent('uint32', undefined, 2);
    input.body.name = '温度提醒';
    f.api.write.mockRejectedValue(Error('lost response'));
    await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    const changed = typedDetail(input); changed.rule.name = '其他名称'; f.api.get.mockResolvedValue(changed);
    expect((await f.create().recover(input.ruleId, true, f.signal)).outcome).toBe('changed');
    expect(f.api.write).toHaveBeenCalledTimes(1); expect(await f.client.pending()).toEqual([input]);
    await expect(f.client.acceptChanged({ ...input, body: { ...input.body, name: '其他名称' } }, f.signal)).rejects.toThrow('AUTOMATION_PENDING_CHANGED');
    f.api.get.mockResolvedValue(typedDetail(input));
    expect((await f.client.recover(input.ruleId, false, f.signal)).outcome).toBe('confirmed');
    expect(f.api.write).toHaveBeenCalledTimes(1); expect(await f.client.pending()).toEqual([]);
  });

  it('keeps named retries exact and old journals nameless without a read-time rewrite', async () => {
    const f = setup(), input = typedIntent(); input.body.name = '  温度提醒  ';
    f.api.write.mockRejectedValueOnce(Error('lost response'));
    await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    const normalized = automationIntent(input);
    expect(await f.create().pending()).toEqual([normalized]);
    f.api.get.mockRejectedValueOnce(Object.assign(Error('not found'), { code: 'AUTOMATION_NOT_FOUND' }));
    f.api.write.mockResolvedValue(typedDetail({ ...input, body: { ...input.body, name: '温度提醒' } }));
    expect((await f.client.recover(input.ruleId, true, f.signal)).outcome).toBe('confirmed');
    expect(f.api.write.mock.calls[1][0]).toEqual(normalized);

    f.api.write.mockRejectedValueOnce(Error('lost old response'));
    await expect(f.client.submit(intent, f.signal)).rejects.toThrow();
    const [key, raw] = [...f.values][0], writes = f.storage.setItem.mock.calls.length;
    expect(await f.create().pending()).toEqual([intent]);
    expect(f.values.get(key)).toBe(raw); expect(f.storage.setItem).toHaveBeenCalledTimes(writes);
    expect(Object.hasOwn((await f.client.pending())[0].body, 'name')).toBe(false);
  });

  it('rejects a mismatched named initial success and malformed named history without erasing either', async () => {
    const f = setup(), input = typedIntent(); input.body.name = '温度提醒';
    f.api.write.mockResolvedValue(typedDetail());
    await expect(f.client.submit(input, f.signal)).rejects.toThrow('AUTOMATION_WRITE_NOT_CONFIRMED');
    expect(await f.client.pending()).toEqual([input]);
    const [key, raw] = [...f.values][0], corrupted = JSON.parse(raw);
    corrupted[0].body.name = ''; const invalid = JSON.stringify(corrupted); f.values.set(key, invalid);
    await expect(f.create().pending()).rejects.toThrow('AUTOMATION_JOURNAL_INVALID');
    expect(f.values.get(key)).toBe(invalid); expect(f.api.write).toHaveBeenCalledTimes(1);
  });
});
