import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { AutomationClient } from '../../../core/device-v2/automation/client';
import { AutomationCondition, AutomationDetail, AutomationIntent, automationDetail, automationIntent,
  automationPage } from '../../../core/device-v2/automation/contract';
import { AutomationPage } from './automation.page';
import { AutomationService } from './automation.service';

// This is a rendered Angular/Ionic form regression, not a device acceptance test.
// API replies, capability cache and intent persistence are explicit local doubles;
// the production template, Ionic value accessors, service and client are retained.
const manifest = { revision: 1, fingerprint: 'ab'.repeat(32), fields: [
  { id: 1, key: 'power', kind: 0, type: 0, access: 7 },
  { id: 2, key: 'temperature', kind: 0, type: 3, access: 7 },
  { id: 3, key: 'level', kind: 0, type: 2, access: 7, constraints: { minimum: 0, maximum: 10, step: 2 } },
] };
type FormControl = HTMLElement & { value: string | number | boolean; disabled: boolean };

describe('automation rendered form management flow (local API/cache/storage doubles)', () => {
  let fixture: ComponentFixture<AutomationPage>;
  let service: AutomationService;
  let replies: Map<string, AutomationDetail>;
  let api: ReturnType<typeof createApi>;
  let alerts: { create: ReturnType<typeof vi.fn> };
  let devices: Record<string, any>;

  function createApi() {
    return {
      list: vi.fn(async (retired: boolean, _after: string | undefined, _signal: AbortSignal) => automationPage({
        rules: [...replies.values()].map(detail => detail.rule).filter(rule => (rule.retiredAtMs !== null) === retired),
        nextAfter: null,
      })),
      get: vi.fn(async (id: string, _signal: AbortSignal) => {
        const detail = replies.get(id);
        if (!detail) throw new Error('AUTOMATION_NOT_FOUND');
        return automationDetail(structuredClone(detail), id);
      }),
      write: vi.fn(async (raw: AutomationIntent, _signal: AbortSignal) => {
        const intent = automationIntent(raw);
        const previous = replies.get(intent.ruleId);
        expect(intent.body.expectedRevision).toBe(previous?.rule.definitionRevision ?? 0);
        if (intent.operation === 'retire') {
          if (!previous) throw new Error('AUTOMATION_NOT_FOUND');
          const detail = automationDetail({ ...previous, rule: { ...previous.rule, definitionRevision: intent.body.expectedRevision + 1,
            enabled: false, status: 'retired', retiredAtMs: 200, updatedAtMs: 200 } }, intent.ruleId);
          replies.set(intent.ruleId, detail); return detail;
        }
        if (!('policyVersion' in intent.body)) throw new Error('Unexpected test write');
        const { expectedRevision, ...definition } = intent.body;
        const detail = automationDetail({ rule: { ...definition, ruleId: intent.ruleId,
          definitionRevision: expectedRevision + 1, status: definition.enabled ? 'waiting-baseline' : 'disabled',
          targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 100 + expectedRevision },
          recentExecutions: previous?.recentExecutions ?? [],
        }, intent.ruleId);
        replies.set(intent.ruleId, detail);
        return structuredClone(detail);
      }),
    };
  }

  beforeEach(async () => {
    replies = new Map(); api = createApi();
    alerts = { create: vi.fn(async () => ({ present: async () => undefined, onDidDismiss: async () => ({ role: 'confirm' }) })) };
    devices = {
      source: { deviceType: 'diy', config: { mode: 'bbp2', customName: 'Source' } },
      target: { deviceType: 'diy', config: { mode: 'bbp2', customName: 'Target' } },
    };
    const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), device: { dict: devices } };
    const values = new Map<string, string>();
    const client = new AutomationClient(api, {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    }, () => ({ authority: API.BASE_URL, accountId: data.auth.uuid, sessionEpoch: data.sessionEpoch }));
    service = new AutomationService(client, data as any, { load: () => manifest } as any);
    TestBed.overrideComponent(AutomationPage, { set: { providers: [{ provide: AutomationService, useValue: service }] } });
    await TestBed.configureTestingModule({ imports: [AutomationPage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), { provide: AlertController, useValue: alerts },
    ] }).compileComponents();
    fixture = TestBed.createComponent(AutomationPage);
    fixture.detectChanges();
    // Ionic router lifecycle is driven explicitly; form values are never assigned to the page.
    fixture.componentInstance.ionViewWillEnter();
    await settled();
  });

  afterEach(() => {
    fixture?.destroy();
    service?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  async function settled(): Promise<void> {
    await fixture.whenStable();
    await vi.waitFor(() => { expect(service.state().busy).toBe(false); });
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function control(tag: 'ion-select' | 'ion-input', label: string): FormControl {
    const element = fixture.nativeElement.querySelector(`${tag}[label="${label}"]`) as FormControl | null;
    expect(element, label).not.toBeNull();
    return element!;
  }

  async function input(tag: 'ion-select' | 'ion-input', label: string, value: string | boolean): Promise<void> {
    const element = control(tag, label);
    expect(element.disabled).toBe(false);
    element.value = value;
    element.dispatchEvent(new CustomEvent(tag === 'ion-select' ? 'ionChange' : 'ionInput', {
      bubbles: true, detail: { value },
    }));
    await settled();
  }

  function button(label: string): FormControl {
    const element = [...fixture.nativeElement.querySelectorAll('ion-button')]
      .find((candidate: HTMLElement) => candidate.textContent?.trim() === label) as FormControl | undefined;
    expect(element, label).toBeDefined();
    return element!;
  }

  async function click(label: string): Promise<void> {
    const element = button(label);
    expect(element.disabled).toBe(false);
    element.click();
    await settled();
  }

  it('renders the list after delayed discard confirmation without a second click or manual detectChanges', async () => {
    await click('新建自动化'); await input('ion-input', '名称', '未保存草稿');
    fixture.autoDetectChanges();
    let dismiss!: (result: { role: string }) => void;
    alerts.create.mockResolvedValueOnce({ present: async () => undefined,
      onDidDismiss: () => new Promise(resolve => { dismiss = resolve; }) });
    const leaving = fixture.componentInstance.leaveView();
    await vi.waitFor(() => expect(dismiss).toBeDefined());
    expect(fixture.nativeElement.querySelector('ion-input[label="名称"]')).not.toBeNull();
    dismiss({ role: 'confirm' }); await leaving;
    expect(fixture.componentInstance.view).toBe('list');
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('ion-input[label="名称"]')).toBeNull());
    expect(fixture.nativeElement.textContent).toContain('我的自动化');
    expect(api.write).not.toHaveBeenCalled();
  });

  it.each([
    { source: 'source:1', direction: 'rising', condition: { kind: 'boolean-edge', direction: 'rising' } },
    { source: 'source:1', direction: 'falling', condition: { kind: 'boolean-edge', direction: 'falling' } },
    { source: 'source:2', direction: 'above', condition: { kind: 'numeric-threshold', direction: 'above', threshold: 30.5, hysteresis: 1.25 } },
    { source: 'source:2', direction: 'below', condition: { kind: 'numeric-threshold', direction: 'below', threshold: 30.5, hysteresis: 1.25 } },
  ] as { source: string; direction: string; condition: AutomationCondition }[])(
    '$direction: DOM create disabled → enable → read result → disable → reenter', async row => {
      expect(fixture.nativeElement.querySelector('ion-input')).toBeNull();
      await click('新建自动化');
      await input('ion-input', '名称', '房间联动');
      await input('ion-select', '源属性', row.source);
      await input('ion-select', '触发条件', row.direction);
      if (row.condition.kind === 'numeric-threshold') {
        expect(button('保存自动化').disabled).toBe(true);
        await input('ion-input', '触发阈值', '30.5');
        await input('ion-input', '恢复幅度（回差）', '1.25');
      }
      await input('ion-select', '目标属性', 'target:1');
      await input('ion-select', '目标值', false);
      await click('保存自动化');
      expect(api.write).toHaveBeenCalledTimes(1);
      const saved = api.write.mock.calls[0][0];
      expect(saved).toMatchObject({ operation: 'put', body: { expectedRevision: 0, enabled: false,
        target: { value: false }, policyVersion: 2, condition: row.condition } });
      expect(fixture.nativeElement.textContent).toContain('未启用');
      expect(fixture.nativeElement.textContent).toContain('暂无执行记录。保存或启用不等于已经触发。');

      await click('启用');
      expect(api.write.mock.calls[1][0]).toMatchObject({ ruleId: saved.ruleId,
        body: { expectedRevision: 1, enabled: true, condition: row.condition } });
      expect(fixture.nativeElement.textContent).toContain('已启用 · 等待首次数据');

      // Supply an execution reply, not a fabricated device trigger or hardware assertion.
      const enabled = replies.get(saved.ruleId)!;
      replies.set(saved.ruleId, { ...enabled, recentExecutions: [{ executionId: 'execution-one',
        definitionRevision: 2, state: 'acknowledged', createdAtMs: 101, updatedAtMs: 102 }] });
      await click('返回');
      expect(fixture.nativeElement.querySelector('code')).toBeNull();
      await click('详情与结果');
      expect(api.get).toHaveBeenCalledWith(saved.ruleId, expect.any(AbortSignal));
      expect(fixture.nativeElement.textContent).toContain('设备已确认');
      expect(fixture.nativeElement.textContent).toContain('不代表实物动作已完成');
      expect(fixture.nativeElement.querySelector('details').open).toBe(false);

      await click('停用');
      expect(api.write.mock.calls[2][0]).toMatchObject({ ruleId: saved.ruleId,
        body: { expectedRevision: 2, enabled: false, condition: row.condition } });
      expect(fixture.nativeElement.textContent).toContain('未启用');
      fixture.componentInstance.ionViewWillLeave();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain(saved.ruleId);
      fixture.componentInstance.ionViewWillEnter();
      await settled();
      expect(service.state().rules[0]).toMatchObject({ ruleId: saved.ruleId, definitionRevision: 3,
        enabled: false, condition: row.condition });
      expect(fixture.nativeElement.querySelector('ion-select')).toBeNull();
      await click('详情与结果');
      expect(fixture.nativeElement.textContent).toContain('设备已确认');
      expect(api.write).toHaveBeenCalledTimes(3);
    });

  it('DOM numeric clearing and source reselection cannot save invalid or stale conditions', async () => {
    await click('新建自动化'); await input('ion-input', '名称', '阈值联动');
    await input('ion-select', '源属性', 'source:2');
    expect(control('ion-select', '触发条件').value).toBe('above');
    await input('ion-select', '目标属性', 'target:1');
    await input('ion-input', '触发阈值', '30');
    for (const value of ['', '0', '-1', '1e309']) {
      await input('ion-input', '恢复幅度（回差）', value);
      expect(button('保存自动化').disabled).toBe(true);
    }
    await input('ion-input', '恢复幅度（回差）', '2');
    expect(button('保存自动化').disabled).toBe(false);
    await input('ion-input', '触发阈值', '');
    expect(button('保存自动化').disabled).toBe(true);
    await input('ion-select', '源属性', 'target:1');
    expect(control('ion-select', '触发条件').value).toBe('rising');
    expect(control('ion-select', '目标属性').value).toBe('');
    expect(fixture.nativeElement.querySelector('ion-input[label="触发阈值"]')).toBeNull();
    expect(button('保存自动化').disabled).toBe(true);
    await input('ion-select', '源属性', 'source:2');
    expect(control('ion-input', '触发阈值').value).toBeNull();
    expect(control('ion-input', '恢复幅度（回差）').value).toBeNull();
    expect(api.write).not.toHaveBeenCalled();
  });
  it('DOM uses display aliases and boolean labels but sends the unchanged stable protocol key/value', async () => {
    devices['source'].displayMetadata = { logicalDeviceId: 'source', revision: 1, name: '玄关感应器', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '有人', trueLabel: '检测到人', falseLabel: '无人' } ] };
    devices['target'].displayMetadata = { logicalDeviceId: 'target', revision: 1, name: '客厅灯', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' } ] };
    await service.refresh(); await settled();
    await click('新建自动化'); await input('ion-input', '名称', '进门亮灯');
    await input('ion-select', '源属性', 'source:1'); await input('ion-select', '目标属性', 'target:1');
    expect(control('ion-select', '源属性').textContent).toContain('玄关感应器 · 有人');
    expect(control('ion-select', '目标属性').textContent).toContain('客厅灯 · 电源开关');
    expect(control('ion-select', '触发条件').textContent).toContain('从无人变为检测到人');
    expect(control('ion-select', '目标值').textContent).toContain('亮');
    await click('保存自动化');
    expect(api.write.mock.calls[0][0]).toMatchObject({ body: { source: { deviceId: 'source', key: 'power' },
      target: { deviceId: 'target', key: 'power', value: true }, condition: { kind: 'boolean-edge', direction: 'rising' } } });
    expect(fixture.nativeElement.textContent).toContain('客厅灯 · 电源开关：亮');
  });
  it('DOM name/edit uses fresh CAS, keeps endpoints and explicitly confirms enabled edits', async () => {
    await click('新建自动化'); await input('ion-input', '名称', '  开灯联动  ');
    await input('ion-select', '源属性', 'source:1'); await input('ion-select', '目标属性', 'target:1');
    await click('保存自动化');
    const created = api.write.mock.calls[0][0];
    expect(created).toMatchObject({ body: { name: '开灯联动', enabled: false } });
    await click('启用'); await click('编辑');
    expect(fixture.nativeElement.querySelector('ion-select[label="源属性"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-select[label="目标属性"]')).toBeNull();
    expect(button('刷新').disabled).toBe(true);
    await input('ion-input', '名称', '关灯联动'); await input('ion-select', '触发条件', 'falling');
    await input('ion-select', '目标值', false);
    alerts.create.mockResolvedValueOnce({ present: async () => undefined, onDidDismiss: async () => ({ role: 'cancel' }) });
    await click('保存修改'); expect(api.write).toHaveBeenCalledTimes(2);
    await click('保存修改');
    expect(api.write.mock.calls[2][0]).toMatchObject({ ruleId: created.ruleId, body: { expectedRevision: 2,
      enabled: true, name: '关灯联动', source: created.operation === 'put' ? created.body.source : undefined,
      target: created.operation === 'put' ? { ...created.body.target, value: false } : undefined,
      condition: { kind: 'boolean-edge', direction: 'falling' } } });
    expect(fixture.nativeElement.textContent).toContain('关灯联动');
    await click('停用'); expect(api.write.mock.calls[3][0]).toMatchObject({ body: { name: '关灯联动', enabled: false } });
  });
  it('DOM deletion is confirmed soft retirement, with a read-only history not a second executable list', async () => {
    await click('新建自动化'); await input('ion-input', '名称', '删除对照');
    await input('ion-select', '源属性', 'source:1'); await input('ion-select', '目标属性', 'target:1');
    await click('保存自动化'); const created = api.write.mock.calls[0][0];
    await click('删除'); expect(api.write.mock.calls[1][0]).toMatchObject({ ruleId: created.ruleId,
      operation: 'retire', body: { expectedRevision: 1 } });
    expect(fixture.nativeElement.textContent).not.toContain('删除对照');
    await click('已删除记录'); expect(fixture.nativeElement.textContent).toContain('删除对照');
    expect(fixture.nativeElement.querySelector('ion-input')).toBeNull();
    await click('详情与结果'); expect(fixture.nativeElement.textContent).toContain('已删除');
    for (const label of ['启用', '停用', '编辑', '删除']) expect([...fixture.nativeElement.querySelectorAll('ion-button')]
      .some((element: HTMLElement) => element.textContent?.trim() === label)).toBe(false);
    expect(replies.get(created.ruleId)?.rule.definitionRevision).toBe(2);
  });
  it('DOM unknown create keeps exact original named request, not the subsequently changed form', async () => {
    await click('新建自动化'); await input('ion-input', '名称', '原名称');
    await input('ion-select', '源属性', 'source:1'); await input('ion-select', '目标属性', 'target:1');
    api.write.mockRejectedValueOnce(new Error('network lost'));
    await click('保存自动化'); const original = structuredClone(api.write.mock.calls[0][0]);
    expect(service.state().pending).toEqual([original]);
    expect(fixture.nativeElement.textContent).toContain('有保存结果待确认');
    await input('ion-input', '名称', '不能替换原请求'); expect(button('保存自动化').disabled).toBe(true);
    await click('查询原请求'); expect(api.write).toHaveBeenCalledTimes(1);
    await click('恢复同一请求'); expect(api.write).toHaveBeenCalledTimes(2);
    expect(api.write.mock.calls[1][0]).toEqual(original);
    expect(service.state().pending).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('原名称');
    expect(fixture.nativeElement.querySelector('ion-input')).toBeNull();
  });
  it('DOM uint32 target has no zero default, checks cached range and saves/edits exact values and CAS', async () => {
    devices['target'].displayMetadata = { logicalDeviceId: 'target', revision: 1, name: '客厅风扇', capabilities: [
      { key: 'level', kind: 0, type: 2, displayName: '风速档位' } ] };
    await service.refresh(); await settled();
    await click('新建自动化'); await input('ion-input', '名称', '进门调风速');
    expect(control('ion-select', '目标值').disabled).toBe(true);
    await input('ion-select', '源属性', 'source:1'); await input('ion-select', '目标属性', 'target:3');
    expect(fixture.nativeElement.querySelector('ion-select[label="目标值"]')).toBeNull();
    expect(control('ion-input', '目标值').value).toBe(''); expect(button('保存自动化').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('最小值 0'); expect(fixture.nativeElement.textContent).toContain('最大值 10');
    expect(fixture.nativeElement.textContent).toContain('步长 2');
    for (const value of ['', '-0', '-1', '1.5', '3', '11', '1e309']) {
      await input('ion-input', '目标值', value); expect(button('保存自动化').disabled).toBe(true);
    }
    await input('ion-input', '目标值', '0'); await click('保存自动化');
    const created = api.write.mock.calls[0][0];
    expect(created).toMatchObject({ operation: 'put', body: { expectedRevision: 0, enabled: false,
      target: { deviceId: 'target', key: 'level', valueType: 'uint32', value: 0 }, policyVersion: 2 } });
    expect(fixture.nativeElement.textContent).toContain('客厅风扇 · 风速档位：0');
    await click('编辑'); expect(control('ion-input', '目标值').value).toBe(0);
    expect(fixture.nativeElement.querySelector('ion-select[label="目标属性"]')).toBeNull();
    await input('ion-input', '目标值', '10'); await click('保存修改');
    expect(api.write.mock.calls[1][0]).toMatchObject({ ruleId: created.ruleId, body: { expectedRevision: 1, enabled: false,
      target: { deviceId: 'target', key: 'level', valueType: 'uint32', value: 10 } } });
    expect(fixture.nativeElement.textContent).toContain('客厅风扇 · 风速档位：10');
    await click('启用'); expect(api.write.mock.calls[2][0]).toMatchObject({ ruleId: created.ruleId,
      body: { expectedRevision: 2, enabled: true, target: { valueType: 'uint32', value: 10 } } });
  });
  it('DOM switching target type clears numeric input, and unknown numeric create retries the exact old value', async () => {
    await click('新建自动化'); await input('ion-input', '名称', '原档位'); await input('ion-select', '源属性', 'source:1');
    await input('ion-select', '目标属性', 'target:3'); await input('ion-input', '目标值', '5');
    await input('ion-select', '目标属性', 'target:1'); expect(control('ion-select', '目标值').value).toBe(true);
    await input('ion-select', '目标属性', 'target:3'); expect(control('ion-input', '目标值').value).toBe('');
    expect(button('保存自动化').disabled).toBe(true); await input('ion-input', '目标值', '0');
    api.write.mockRejectedValueOnce(new Error('lost numeric response')); await click('保存自动化');
    const original = structuredClone(api.write.mock.calls[0][0]); expect(service.state().pending).toEqual([original]);
    await input('ion-input', '目标值', '9'); await input('ion-input', '名称', '不得替换原请求');
    expect(button('保存自动化').disabled).toBe(true); await click('查询原请求'); expect(api.write).toHaveBeenCalledTimes(1);
    await click('恢复同一请求'); expect(api.write.mock.calls[1][0]).toEqual(original);
    expect(service.state().pending).toEqual([]); expect(fixture.nativeElement.textContent).toContain('Target · level：0');
    expect(fixture.nativeElement.textContent).toContain('原档位');
  });
});
