import '@angular/compiler';
import { Subject } from 'rxjs';
import { AutomationService } from './automation.service';
import { AutomationPage } from './automation.page';
import { automationChoices, automationChoiceValue, automationConditionText, automationDeviceName, automationErrorText, automationExecutionText, automationRuleStatus } from './automation.models';
import { AutomationDetail, AutomationIntent, AutomationRule, automationIntent } from '../../../core/device-v2/automation/contract';
const manifest = { revision: 1, fingerprint: 'ab'.repeat(32), fields: [
  { id: 1, key: 'power', kind: 0, type: 0, access: 7 }, { id: 2, key: 'button', kind: 1, type: 0, access: 7 },
  { id: 3, key: 'readOnly', kind: 0, type: 0, access: 1 }, { id: 4, key: 'value', kind: 0, type: 2, access: 7 }] };
const endpoint = { deviceId: 'source', key: 'power', fingerprint: manifest.fingerprint, valueType: 'boolean' as const };
const detail: AutomationDetail = { rule: { ruleId: 'rule', definitionRevision: 1, source: endpoint,
  target: { ...endpoint, deviceId: 'target', value: true }, enabled: false, condition: 'rising-boolean', policyVersion: 1,
  status: 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 1 }, recentExecutions: [] };
function setup() {
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), device: { dict: {
    source: { deviceType: 'diy', config: { mode: 'bbp2', customName: 'Source' } },
    target: { deviceType: 'diy', config: { mode: 'bbp2', customName: 'Target' } } } } };
  const client = { list: vi.fn(async (_retired: boolean, _after: string | undefined, _signal: AbortSignal) => ({ rules: [detail.rule], nextAfter: null })),
    pending: vi.fn(async () => [] as any[]), get: vi.fn(async () => detail), submit: vi.fn(async (_intent: any, _signal: AbortSignal) => detail),
    recover: vi.fn(async () => ({ detail, outcome: 'unresolved' as const })), acceptChanged: vi.fn(async () => detail) };
  const service = new AutomationService(client as any, data as any, { load: () => manifest } as any);
  const alerts = { create: vi.fn(async () => ({ present: async () => undefined, onDidDismiss: async () => ({ role: 'confirm' }) })) };
  const page = new AutomationPage(service, alerts as any, { markForCheck: vi.fn() } as any); page.name = '测试自动化';
  return { data, client, service, alerts, page };
}
describe('minimal automation view lifecycle', () => {
  it('shows shared names/boolean labels without altering rule endpoints, revisions or choices', async () => {
    const f = setup();
    const metadata = { logicalDeviceId: 'target', revision: 1, name: '客厅灯', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' },
    ] };
    Object.assign(f.data.device.dict.target, { displayMetadata: metadata });
    await f.service.open();
    expect(f.service.endpointLabel(detail.rule.target)).toBe('客厅灯 · 电源开关');
    expect(f.page.actionText(detail.rule)).toBe('客厅灯 · 电源开关：亮');
    expect(f.service.state().choices.find(c => c.id === 'target:1')?.label).toBe('客厅灯 · 电源开关');
    expect(detail.rule.target).toEqual({ ...endpoint, deviceId: 'target', value: true });
    expect(f.service.endpointLabel({ ...detail.rule.target, valueType: 'uint32' })).toBe('客厅灯 · power');
    expect(automationErrorText({ code: 'AUTOMATION_TARGET_CONFLICT' })).toContain('目标设备');
    f.service.ngOnDestroy();
  });
  it('offers only owned ordinary WiFi scalar source Properties and boolean/uint32 targets; cache is not authority', () => {
    const device = { deviceType: 'diy', config: { mode: 'bbp2' } };
    const choices = automationChoices({ good: device, ble: { ...device, deviceType: 'ble' }, hub: { ...device, deviceType: 'edge-hub' },
      shared: { ...device, config: { ...device.config, isShared: true } }, preview: { ...device, config: { ...device.config, isPreview: true } },
      child: { ...device, gatewayRouted: true }, unknown: { ...device, deviceType: undefined } }, () => manifest as any);
    expect(choices).toHaveLength(2); expect(choices[0].endpoint.key).toBe('power'); expect(choices[0].source).toBe(true); expect(choices[0].target).toBe(true);
    expect(choices[1].endpoint.valueType).toBe('uint32'); expect(choices[1].source).toBe(true); expect(choices[1].target).toBe(true);
    expect(automationChoices({ good: device }, () => undefined)).toEqual([]);
    expect(automationDeviceName({ b: device, a: device }, 'a')).toBe('未命名设备 1');
    expect(automationDeviceName({ b: device, a: device }, 'b')).toBe('未命名设备 2');
    expect(automationDeviceName({}, 'missing')).toBe('设备不在当前列表');
    expect(automationExecutionText.acknowledged).toBe('设备已确认');
    expect(automationErrorText({ code: 'HTTP_404' })).toContain('尚未提供');
  });
  it('creates disabled with a stable intent, never allows same source/target or auto-enable', async () => {
    const f = setup(); await f.service.open(); f.page.source = 'source:1'; f.page.target = 'target:1';
    expect(f.page.canCreate).toBe(true); await f.page.save();
    expect(f.client.submit).toHaveBeenCalledTimes(1);
    expect(f.client.submit.mock.calls[0][0]).toMatchObject({ operation: 'put', body: { expectedRevision: 0, enabled: false,
      target: { value: true }, policyVersion: 2, condition: { kind: 'boolean-edge', direction: 'rising' } } });
    f.page.target = 'source:1'; expect(f.page.canCreate).toBe(false); await f.page.save(); expect(f.client.submit).toHaveBeenCalledTimes(1);
    f.service.ngOnDestroy();
  });
  it('unknown creation remains tracked and does not optimistic-update the list', async () => {
    const f = setup(); await f.service.open(); f.client.submit.mockRejectedValueOnce(Error('unknown'));
    const pending = { ruleId: 'pending', operation: 'put', body: { expectedRevision: 0, enabled: false, source: endpoint, target: detail.rule.target } };
    f.client.pending.mockResolvedValue([pending]); await f.service.create('source:1', 'target:1', true, { kind: 'boolean-edge', direction: 'rising' });
    expect(f.service.state().rules).toEqual([detail.rule]); expect(f.service.state().pending).toEqual([pending]);
    f.page.source = 'source:1'; f.page.target = 'target:1'; expect(f.page.canCreate).toBe(false);
    await f.service.recover(pending as any); expect(f.client.submit).toHaveBeenCalledTimes(1);
    expect(f.service.state().notice).toContain('尚未确认'); f.service.ngOnDestroy();
  });
  it('exit cancels in-flight reads; late completion cannot repopulate a closed view', async () => {
    const f = setup(); let resolve!: (v: any) => void;
    f.client.list.mockImplementationOnce(() => new Promise(r => resolve = r));
    const open = f.service.open(), signal = f.client.list.mock.calls[0][2];
    f.page.ionViewWillLeave(); expect(signal.aborted).toBe(true); resolve({ rules: [detail.rule], nextAfter: null }); await open;
    expect(f.service.state().ready).toBe(false); expect(f.service.state().rules).toEqual([]); f.service.ngOnDestroy();
  });
  it('account switch cancels a pending write and never copies success into the next account', async () => {
    const f = setup(); await f.service.open(); let resolve!: (v: any) => void;
    f.client.submit.mockImplementationOnce(() => new Promise(r => resolve = r));
    const write = f.service.toggle(detail.rule), signal = f.client.submit.mock.calls[0][1];
    f.data.auth.uuid = 'other'; f.data.sessionEpoch++; f.data.authDataChanged.next();
    expect(signal.aborted).toBe(true); resolve(detail); await write;
    expect(f.service.state().detail).toBeUndefined(); expect(f.service.state().rules).toEqual([]);
    expect(f.service.state().error).toContain('账号'); f.service.ngOnDestroy();
  });
  it('a confirmation that outlives the page cannot retire or retry a rule', async () => {
    const f = setup(); await f.service.open(); let resolve!: (v: any) => void;
    f.alerts.create.mockResolvedValueOnce({ present: async () => undefined, onDidDismiss: () => new Promise(r => resolve = r) });
    const operation = f.page.retire(detail.rule); await Promise.resolve(); await Promise.resolve();
    f.page.ionViewWillLeave(); resolve({ role: 'confirm' }); await operation;
    expect(f.client.submit).not.toHaveBeenCalled(); f.service.ngOnDestroy();
  });
  it('unavailable service denies new writes but still exposes local unresolved requests', async () => {
    const f = setup(); const pending = { ruleId: 'p', operation: 'retire', body: { expectedRevision: 1 } };
    f.client.pending.mockResolvedValue([pending]); f.client.list.mockRejectedValue(Object.assign(Error(), { code: 'HTTP_404' }));
    await f.service.open(); expect(f.service.state().ready).toBe(false); expect(f.service.state().pending).toEqual([pending]);
    await f.service.toggle(detail.rule); expect(f.client.submit).not.toHaveBeenCalled(); f.service.ngOnDestroy();
  });
  it('maps scalar sources and excludes Action, unsupported targets and non-notify sources', () => {
    const fields = Array.from({ length: 5 }, (_, type) => ({ id: type + 1, key: `scalar${type}`, kind: 0, type, access: 7 }));
    const choices = automationChoices({ good: { deviceType: 'diy', config: { mode: 'bbp2' } } }, () => ({ ...manifest, fields: [
      ...fields, { id: 6, key: 'text', kind: 0, type: 5, access: 7 }, { id: 7, key: 'action', kind: 1, type: 0, access: 7 },
      { id: 8, key: 'withoutNotify', kind: 0, type: 3, access: 3 },
      { id: 9, key: 'writeOnlyBool', kind: 0, type: 0, access: 2 },
    ] } as any));
    expect(choices.slice(0, 5).map(choice => choice.endpoint.valueType)).toEqual(['boolean', 'int32', 'uint32', 'float32', 'float64']);
    expect(choices).toHaveLength(6); expect(choices.slice(0, 5).every(choice => choice.source)).toBe(true);
    expect(choices.filter(choice => choice.target).map(choice => choice.endpoint.key)).toEqual(['scalar0', 'scalar2', 'writeOnlyBool']);
    expect(choices.at(-1).source).toBe(false);
  });
  it('switching source type clears incompatible condition inputs and same-device targets', async () => {
    const f = setup(); await f.service.open(); f.page.source = 'source:1'; f.page.target = 'target:1'; f.page.condition = 'falling';
    expect(f.page.conditionValue).toEqual({ kind: 'boolean-edge', direction: 'falling' });
    f.page.source = 'source:4'; f.page.sourceChanged();
    expect(f.page.condition).toBe('above'); expect(f.page.threshold).toBeNull(); expect(f.page.hysteresis).toBeNull();
    expect(f.page.target).toBe('target:1'); expect(f.page.canCreate).toBe(false);
    f.page.threshold = 30; f.page.hysteresis = 2; expect(f.page.canCreate).toBe(true);
    f.page.source = 'target:1'; f.page.sourceChanged(); expect(f.page.target).toBe('');
    expect(f.page.condition).toBe('rising'); expect(f.page.threshold).toBeNull(); expect(f.page.hysteresis).toBeNull();
    f.service.ngOnDestroy();
  });
  it('serializes named numeric above/below as explicit A2 disabled writes', async () => {
    const f = setup(); await f.service.open();
    for (const direction of ['above', 'below'] as const) {
      f.page.startCreate(); f.page.name = '阈值联动'; f.page.source = 'source:4'; f.page.sourceChanged(); f.page.target = 'target:1';
      f.page.condition = direction; f.page.threshold = 30; f.page.hysteresis = 2; f.page.value = false;
      await f.page.save(); const intent = f.client.submit.mock.calls.at(-1)[0] as AutomationIntent;
      expect(intent.operation).toBe('put'); expect(Object.keys(intent.body)).toEqual(['expectedRevision', 'enabled', 'source', 'target', 'policyVersion', 'condition', 'name']);
      expect(intent).toMatchObject({ body: { expectedRevision: 0, enabled: false, source: { valueType: 'uint32' },
        target: { valueType: 'boolean', value: false }, policyVersion: 2,
        condition: { kind: 'numeric-threshold', direction, threshold: 30, hysteresis: 2 } } });
      expect(automationIntent(JSON.parse(JSON.stringify(intent)))).toEqual(intent);
    }
    expect(f.client.submit).toHaveBeenCalledTimes(2); f.service.ngOnDestroy();
  });
  it('denies invalid threshold/hysteresis and incompatible condition before new write', async () => {
    const f = setup(); await f.service.open(); f.page.source = 'source:4'; f.page.sourceChanged(); f.page.target = 'target:1';
    for (const [threshold, hysteresis] of [[null, 2], [30, null], [30, 0], [30, -1], [Infinity, 2], [30, NaN],
      [-0, 2], [Number.MAX_VALUE, Number.MIN_VALUE], [-Number.MAX_VALUE, Number.MAX_VALUE]]) {
      f.page.threshold = threshold; f.page.hysteresis = hysteresis; expect(f.page.conditionValue).toBeUndefined();
      expect(f.page.canCreate).toBe(false); await f.page.save();
    }
    f.page.condition = 'falling'; expect(f.page.conditionValue).toBeUndefined();
    await f.service.create('source:4', 'target:1', true, { kind: 'boolean-edge', direction: 'falling' });
    expect(f.client.submit).not.toHaveBeenCalled(); expect(f.service.state().error).toContain('未发送');
    f.service.ngOnDestroy();
  });
  it('keeps old A1 toggle four-field writes and preserves existing A2 condition on toggles', async () => {
    const f = setup(); await f.service.open(); await f.service.toggle(detail.rule);
    expect(f.client.submit.mock.calls[0][0]).toEqual({ ruleId: 'rule', operation: 'put', body: {
      expectedRevision: 1, enabled: true, source: detail.rule.source, target: detail.rule.target } });
    const typed: AutomationRule = { ...detail.rule, policyVersion: 2,
      source: { ...endpoint, valueType: 'float32' }, condition: { kind: 'numeric-threshold', direction: 'below', threshold: 18, hysteresis: 1.5 } };
    const before = structuredClone(typed); await f.service.toggle(typed);
    expect(f.client.submit.mock.calls[1][0]).toEqual({ ruleId: 'rule', operation: 'put', body: {
      expectedRevision: 1, enabled: true, source: typed.source, target: typed.target, policyVersion: 2, condition: typed.condition } });
    expect(typed).toEqual(before); expect(Object.hasOwn(f.client.submit.mock.calls[0][0].body, 'condition')).toBe(false);
    expect(automationConditionText(typed.condition)).toContain('19.5');
    expect(automationConditionText(detail.rule.condition)).toContain('从关变为开'); f.service.ngOnDestroy();
  });
  it('shows and recovers original typed pending intent without rebuilding from current form or choices', async () => {
    const f = setup(), pending = automationIntent({ ruleId: 'pending-a2', operation: 'put', body: {
      expectedRevision: 0, enabled: false, source: { ...endpoint, valueType: 'float64' }, target: detail.rule.target,
      policyVersion: 2, condition: { kind: 'numeric-threshold', direction: 'above', threshold: 30.5, hysteresis: 1.25 } } });
    const before = structuredClone(pending); f.client.pending.mockResolvedValue([pending]); await f.service.open();
    f.page.source = 'source:4'; f.page.sourceChanged(); f.page.target = 'target:1'; f.page.threshold = 99; f.page.hysteresis = 10;
    expect(f.page.canCreate).toBe(false); expect(f.page.pendingCondition(pending)).toContain('29.25');
    await f.service.recover(pending); expect(f.client.recover).toHaveBeenCalledWith(pending.ruleId, false, expect.any(AbortSignal));
    await f.page.retry(pending); expect(f.client.recover).toHaveBeenCalledWith(pending.ruleId, true, expect.any(AbortSignal));
    expect(f.client.submit).not.toHaveBeenCalled(); expect(f.service.state().pending).toEqual([before]); expect(pending).toEqual(before);
    expect(automationErrorText(new Error('AUTOMATION_UNSUPPORTED_VERSION'))).toContain('不会降级重发');
    expect(automationErrorText(new Error('AUTOMATION_WRITE_NOT_CONFIRMED'))).toContain('请求记录已保留'); f.service.ngOnDestroy();
  });
  it('edits latest original endpoints and revision even when capability choices disappear; named toggles preserve name', async () => {
    const f = setup(); await f.service.open();
    const named: AutomationRule = { ...detail.rule, definitionRevision: 5, name: '旧名称', enabled: true,
      policyVersion: 2, condition: { kind: 'boolean-edge', direction: 'rising' } };
    f.client.get.mockResolvedValue({ ...detail, rule: named });
    f.service.state.update(s => ({ ...s, choices: [] }));
    await f.page.startEdit(detail.rule);
    expect(f.page.editing).toBe(named); expect(f.page.name).toBe('旧名称');
    f.page.name = '  修改后的名称  '; f.page.condition = 'falling'; f.page.value = false;
    await f.page.save();
    expect(f.alerts.create).toHaveBeenCalled();
    expect(f.client.submit.mock.calls[0][0]).toMatchObject({ ruleId: named.ruleId, operation: 'put', body: {
      expectedRevision: 5, enabled: true, name: '修改后的名称', source: named.source,
      target: { ...named.target, value: false }, condition: { kind: 'boolean-edge', direction: 'falling' } } });
    await f.service.toggle(named); expect(f.client.submit.mock.calls[1][0].body.name).toBe('旧名称');
    expect(named.target.value).toBe(true); f.service.ngOnDestroy();
  });
  it('cancelled enabled edit and invalid names do not submit; no 5s observation creates false offline status', async () => {
    const f = setup(); await f.service.open();
    const enabled = { ...detail.rule, enabled: true, status: 'paused' as const };
    f.client.get.mockResolvedValue({ ...detail, rule: enabled }); await f.page.startEdit(enabled);
    for (const name of ['', ' '.repeat(3), 'a'.repeat(81), 'bad\nname']) { f.page.name = name; expect(f.page.canSave).toBe(false); await f.page.save(); }
    f.page.name = '有效名称'; f.alerts.create.mockResolvedValueOnce({ present: async () => undefined, onDidDismiss: async () => ({ role: 'cancel' }) });
    await f.page.save(); expect(f.client.submit).not.toHaveBeenCalled();
    expect(automationRuleStatus(enabled)).toBe('已启用');
    expect(automationRuleStatus({ ...enabled, targetOutcomeUnknown: true })).toBe('已启用 · 上次执行待确认');
    expect(automationRuleStatus({ ...enabled, enabled: false, targetOutcomeUnknown: true })).toBe('未启用 · 上次执行待确认');
    expect(automationRuleStatus({ ...enabled, retiredAtMs: 2 })).toBe('已删除');
    f.service.ngOnDestroy();
  });
  it('backing out invalidates an enabled edit confirmation; failed GET does not open stale detail', async () => {
    const f = setup(); await f.service.open();
    const enabled = { ...detail.rule, name: '旧名称', enabled: true };
    f.client.get.mockResolvedValue({ ...detail, rule: enabled }); await f.page.startEdit(enabled); f.page.name = '新名称';
    let resolve!: (value: any) => void;
    f.alerts.create.mockResolvedValueOnce({ present: async () => undefined, onDidDismiss: () => new Promise(r => resolve = r) });
    const save = f.page.save(); await Promise.resolve(); await Promise.resolve();
    f.page.backToList(); resolve({ role: 'confirm' }); await save;
    expect(f.client.submit).not.toHaveBeenCalled(); expect(f.page.view).toBe('list');
    f.client.get.mockRejectedValueOnce(new Error('network lost')); await f.page.inspect(enabled);
    expect(f.page.view).toBe('list'); expect(f.service.state().error).not.toBe(''); f.service.ngOnDestroy();
  });
  it('validates uint32 form values without guessing defaults or exposing other numeric target types', () => {
    const choice = { endpoint: { ...endpoint, valueType: 'uint32' as const }, minimum: 2, maximum: 10, step: 2 };
    expect(automationChoiceValue(choice, '2')).toBe(2); expect(automationChoiceValue(choice, 10)).toBe(10);
    for (const value of ['', null, false, '-0', -0, -1, '1.5', 1.5, NaN, Infinity, '1e2', '0x10', 1, 3, 11, 0x100000000])
      expect(() => automationChoiceValue(choice, value)).toThrow();
    expect(automationChoiceValue({ endpoint: { ...endpoint, valueType: 'uint32' } }, '0')).toBe(0);
    expect(automationChoiceValue({ endpoint: { ...endpoint, valueType: 'uint32' } }, '4294967295')).toBe(0xffffffff);
    expect(() => automationChoiceValue({ endpoint: { ...endpoint, valueType: 'uint32' }, step: 2 }, 1)).toThrow();
    expect(automationChoiceValue({ endpoint: { ...endpoint, valueType: 'uint32' }, minimum: 1, step: 2 }, 3)).toBe(3);
    expect(() => automationChoiceValue({ endpoint: { ...endpoint, valueType: 'float32' } }, 2)).toThrow();
  });
  it('clears switched target input, accepts explicit zero and sends a named uint32 disabled write', async () => {
    const f = setup(); await f.service.open(); f.page.source = 'source:1'; f.page.target = 'target:1';
    f.page.value = false; f.page.target = 'target:4'; f.page.targetChanged();
    expect(f.page.numericTarget).toBe(true); expect(f.page.value).toBe(''); expect(f.page.canSave).toBe(false);
    f.page.value = '0'; expect(f.page.targetValue).toBe(0); expect(f.page.canSave).toBe(true);
    await f.page.save(); expect(f.client.submit.mock.calls[0][0]).toMatchObject({ body: {
      enabled: false, expectedRevision: 0, target: { key: 'value', valueType: 'uint32', value: 0 }, policyVersion: 2 } });
    f.page.backToList(); f.page.source = 'source:1'; f.page.target = 'target:4'; f.page.targetChanged(); f.page.value = 25;
    f.page.target = 'target:1'; f.page.targetChanged(); expect(f.page.numericTarget).toBe(false); expect(f.page.value).toBe(true);
    f.page.target = ''; f.page.targetChanged(); expect(f.page.targetValue).toBeUndefined();
    f.service.ngOnDestroy();
  });
  it('checks cached uint32 range on create/edit but retains exact original endpoints and CAS', async () => {
    const f = setup();
    (f.service as any).manifests.load = () => ({ ...manifest, fields: [
      ...manifest.fields.filter(field => field.id !== 4), { ...manifest.fields[3], constraints: { minimum: 0, maximum: 10, step: 2 } },
    ] });
    await f.service.open();
    const condition = { kind: 'boolean-edge' as const, direction: 'rising' as const };
    await f.service.create('source:1', 'target:4', 11, condition); expect(f.client.submit).not.toHaveBeenCalled();
    await f.service.create('source:1', 'target:4', 3, condition); expect(f.client.submit).not.toHaveBeenCalled();
    const rule: AutomationRule = { ...detail.rule, policyVersion: 2, condition, name: '档位', definitionRevision: 7,
      target: { ...detail.rule.target, key: 'value', valueType: 'uint32', value: 5 } };
    await f.service.edit(rule, '新档位', condition, 11); expect(f.client.submit).not.toHaveBeenCalled();
    await f.service.edit(rule, '新档位', condition, 3); expect(f.client.submit).not.toHaveBeenCalled();
    await f.service.edit(rule, '新档位', condition, 0);
    expect(f.client.submit.mock.calls[0][0]).toEqual({ ruleId: rule.ruleId, operation: 'put', body: {
      expectedRevision: 7, enabled: false, name: '新档位', source: rule.source,
      target: { ...rule.target, value: 0 }, policyVersion: 2, condition } });
    expect(f.page.actionText(rule)).toBe('Target · value：5'); expect(rule.target.value).toBe(5);
    f.service.ngOnDestroy();
  });
});
