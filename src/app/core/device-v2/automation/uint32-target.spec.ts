import { AutomationClient } from './client';
import { AutomationDetail, AutomationIntent, AutomationWriteV2, automationDetail, automationIntent,
  automationWriteOutcome } from './contract';

const source = { deviceId: 'source', key: 'power', fingerprint: 'ab'.repeat(32), valueType: 'boolean' as const };
const old: AutomationIntent = { ruleId: 'old-rule', operation: 'put', body: { expectedRevision: 0, enabled: false,
  source, target: { ...source, deviceId: 'target', value: true } } };
function numeric(value = 0, revision = 0): AutomationIntent & { operation: 'put'; body: AutomationWriteV2 } {
  return { ruleId: 'uint32-rule', operation: 'put', body: { expectedRevision: revision, enabled: revision > 0, source,
    target: { ...source, deviceId: 'target', key: 'level', valueType: 'uint32', value }, policyVersion: 2,
    condition: { kind: 'boolean-edge', direction: 'rising' } } };
}
function detail(input = numeric()): AutomationDetail {
  const { expectedRevision, ...body } = input.body;
  return { rule: { ...body, ruleId: input.ruleId, definitionRevision: expectedRevision + 1,
    status: body.enabled ? 'observing' : 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 100 },
    recentExecutions: [] };
}
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { values.delete(key); }) };
  const api = { list: vi.fn(), get: vi.fn(async (_id: string, _signal: AbortSignal) => detail()),
    write: vi.fn(async (_input: AutomationIntent, _signal: AbortSignal) => detail()) };
  const context = () => ({ authority: 'https://example.test', accountId: 'owner', sessionEpoch: 1 });
  const create = () => new AutomationClient(api, storage, context);
  return { values, storage, api, create, client: create(), signal: new AbortController().signal };
}

describe('N5 closed policy2 uint32 target contract', () => {
  it('accepts bool/uint32 policy2, while preserving V1 bool-only and old intent bytes', () => {
    for (const value of [0, 1, 0xffffffff]) {
      const input = numeric(value); expect(automationIntent(input)).toEqual(input);
      expect(automationDetail(detail(input), input.ruleId)).toEqual(detail(input));
      expect(automationWriteOutcome(input, detail(input).rule)).toBe('confirmed');
    }
    expect(JSON.stringify(automationIntent(old))).toBe(JSON.stringify(old));
    const bool = { ...numeric(), body: { ...numeric().body, target: old.operation === 'put' ? old.body.target : undefined } };
    expect(JSON.stringify(automationIntent(bool))).toBe(JSON.stringify(bool));
    expect(() => automationIntent({ ...old, body: { ...old.body, target: numeric().body.target } })).toThrow();
    expect(() => automationDetail({ ...detail(), rule: { ...detail().rule, policyVersion: 1, condition: 'rising-boolean' } }, numeric().ruleId)).toThrow();
    for (const valueType of ['int32', 'float32', 'float64', 'number', 'text'])
      expect(() => automationIntent({ ...numeric(), body: { ...numeric().body, target: { ...numeric().body.target, valueType } } })).toThrow();
  });
  it('rejects strings, fractions, non-finite and out-of-width uint32 before persistence or reading a rule', async () => {
    const f = setup();
    for (const value of ['0', '', false, null, -0, -1, 1.5, NaN, Infinity, -Infinity, 0x100000000]) {
      const input = { ...numeric(), body: { ...numeric().body, target: { ...numeric().body.target, value } } };
      expect(() => automationIntent(input)).toThrow();
      expect(() => automationDetail({ ...detail(), rule: { ...detail().rule, target: input.body.target } }, numeric().ruleId)).toThrow();
      await expect(f.client.submit(input as any, f.signal)).rejects.toThrow();
    }
    expect(f.storage.setItem).not.toHaveBeenCalled(); expect(f.api.write).not.toHaveBeenCalled();
  });
  it('reads mixed old bool and uint32 pending history without rewriting either body or namespace', async () => {
    const f = setup(); f.api.write.mockRejectedValue(Error('unknown'));
    await expect(f.client.submit(old, f.signal)).rejects.toThrow();
    const input = numeric(0, 3); await expect(f.client.submit(input, f.signal)).rejects.toThrow();
    const [key, raw] = [...f.values][0], writes = f.storage.setItem.mock.calls.length;
    expect(key).toContain('automation-v1:'); expect(await f.create().pending()).toEqual([old, input]);
    expect(f.values.get(key)).toBe(raw); expect(f.storage.setItem).toHaveBeenCalledTimes(writes);
    f.api.get.mockResolvedValue(detail(input));
    expect((await f.client.recover(input.ruleId, false, f.signal)).outcome).toBe('confirmed');
    expect(await f.client.pending()).toEqual([old]); expect(f.api.write).toHaveBeenCalledTimes(2);
  });
  it('keeps unknown uint32 value and original CAS; changed target cannot confirm or replace it', async () => {
    const f = setup(), input = numeric(0xffffffff, 2), mutable = structuredClone(input);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    f.storage.setItem.mockImplementation(async (key, raw) => { f.values.set(key, raw); entered(); await gate; });
    f.api.write.mockRejectedValueOnce(Error('lost response'));
    const running = f.client.submit(mutable, f.signal); await started; mutable.body.target.value = 0; release();
    await expect(running).rejects.toThrow(); expect(f.api.write.mock.calls[0][0]).toEqual(input);
    f.api.get.mockResolvedValue(detail(numeric(0, 2)));
    expect((await f.client.recover(input.ruleId, true, f.signal)).outcome).toBe('changed');
    expect(await f.client.pending()).toEqual([input]); expect(f.api.write).toHaveBeenCalledTimes(1);
    f.api.get.mockResolvedValue(detail(input));
    expect((await f.create().recover(input.ruleId, false, f.signal)).outcome).toBe('confirmed');
    expect(await f.client.pending()).toEqual([]); expect(f.api.write).toHaveBeenCalledTimes(1);
  });
});
