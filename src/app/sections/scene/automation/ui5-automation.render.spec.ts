import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import type { AutomationDetail, AutomationEndpoint, AutomationIntent, AutomationRule } from '../../../core/device-v2/automation/contract';
import type { AutomationChoice } from './automation.models';
import { AutomationPage } from './automation.page';
import { AutomationService } from './automation.service';

const source: AutomationEndpoint = { deviceId: 'source', key: 'power', fingerprint: 'ab'.repeat(32), valueType: 'boolean' };
const rule: AutomationRule = { ruleId: 'one', name: '客厅联动', definitionRevision: 7, source,
  target: { ...source, deviceId: 'target', valueType: 'uint32', key: 'level', value: 0 },
  condition: { kind: 'boolean-edge', direction: 'rising' }, policyVersion: 2,
  enabled: false, status: 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 1 };
const choices: AutomationChoice[] = [
  { id: 'source:1', label: '客厅灯 · 电源', endpoint: source, source: true, target: false },
  { id: 'target:2', label: '风扇 · 风速', endpoint: rule.target, source: false, target: true, minimum: 0, maximum: 10, step: 2 },
];
const detail: AutomationDetail = { rule, recentExecutions: [] };
type Button = HTMLElement & { disabled: boolean };

// Actual Angular/Ionic template; local state/action doubles only. These tests do
// not open a user account, connect a device, replay intents, or persist a rule.
describe('UI5 automation grouped production template', () => {
  let fixture: ComponentFixture<AutomationPage>;
  let page: AutomationPage;
  let service: ReturnType<typeof createService>;

  function createService() {
    const state = signal<ReturnType<AutomationService['state']>>({ ready: true, busy: false, refreshing: false,
      refreshError: '', error: '', notice: '', retired: false, rules: [rule], pending: [], choices,
      nextAfter: null, detail: undefined, reviewed: undefined });
    return { state, accountScope: 'local-owner', capabilityGuidance: [],
      endpointLabel: (endpoint: AutomationEndpoint) => endpoint.deviceId === 'source' ? '客厅灯 · 电源' : '风扇 · 风速',
      deviceName: () => '风扇', booleanLabel: (_endpoint: unknown, value: boolean) => value ? '开启' : '关闭',
      valueLabel: (endpoint: { value: boolean | number }) => String(endpoint.value),
      targetChoice: (endpoint: AutomationEndpoint) => choices.find(choice => choice.endpoint.deviceId === endpoint.deviceId && choice.endpoint.key === endpoint.key),
      open: vi.fn(), close: vi.fn(), refresh: vi.fn(), retryRefresh: vi.fn(), more: vi.fn(), inspect: vi.fn(),
      toggle: vi.fn(), create: vi.fn(), edit: vi.fn(), retire: vi.fn(), recover: vi.fn(), acceptChanged: vi.fn(),
    };
  }

  beforeEach(async () => {
    service = createService();
    TestBed.overrideComponent(AutomationPage, { set: { providers: [{ provide: AutomationService, useValue: service }] } });
    await TestBed.configureTestingModule({ imports: [AutomationPage], providers: [provideRouter([]),
      provideIonicAngular({ animated: false }), { provide: AlertController, useValue: {
        create: vi.fn(async () => ({ present: async () => undefined, onDidDismiss: async () => ({ role: 'confirm' }) })),
      } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(AutomationPage); page = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable();
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

  function render() { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); }
  function button(label: string, scope: ParentNode = fixture.nativeElement): Button {
    const found = [...scope.querySelectorAll<HTMLElement>('ion-button')].find(item => item.textContent?.trim() === label);
    expect(found, label).toBeDefined(); return found! as Button;
  }

  it('uses one complete rule card, retains condition/action names and invokes the original toggle', () => {
    const second = { ...rule, ruleId: 'two', name: '另一个规则' };
    service.state.update(s => ({ ...s, rules: [rule, second] })); render();
    const list = fixture.nativeElement.querySelector('.rule-list') as HTMLElement;
    expect(list.classList.contains('surface-card')).toBe(false);
    const cards = [...list.querySelectorAll<HTMLElement>('.rule-card.surface-card')];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('h3')?.textContent).toBe('客厅联动');
    expect([...cards[0].querySelectorAll('dt')].map(node => node.textContent)).toEqual(['当', '执行']);
    expect(cards[0].textContent).toContain('客厅灯 · 电源');
    expect(cards[0].textContent).toContain('风扇 · 风速：0');
    expect(cards[0].querySelector('.rule-status')?.textContent).toBe('未启用');
    button('启用', cards[0]).click();
    expect(service.toggle).toHaveBeenCalledExactlyOnceWith(rule);
    expect(service.create).not.toHaveBeenCalled(); expect(service.recover).not.toHaveBeenCalled();
  });

  it('keeps confirmed configuration separate from refreshing and a subsequent read failure', () => {
    page.view = 'detail';
    service.state.update(s => ({ ...s, detail, ready: false, busy: true, refreshing: true, notice: '配置已保存。' })); render();
    expect(fixture.nativeElement.querySelector('.confirmation[role="status"]')?.textContent).toBe('配置已保存。');
    expect(fixture.nativeElement.querySelector('.refreshing[role="status"]')?.textContent).toContain('不会重复提交');
    for (const label of ['启用', '编辑', '删除']) expect(button(label).disabled).toBe(true);
    expect(button('返回').disabled).toBe(false);
    service.state.update(s => ({ ...s, busy: false, refreshing: false, refreshError: '列表尚未更新；已确认的配置保持。' })); render();
    expect(fixture.nativeElement.querySelector('.confirmation')?.textContent).toBe('配置已保存。');
    expect(fixture.nativeElement.querySelector('.refresh-error[role="alert"]')?.textContent).toContain('已确认的配置保持');
    for (const label of ['启用', '编辑', '删除']) expect(button(label).disabled).toBe(true);
    button('重新读取列表').click();
    expect(service.retryRefresh).toHaveBeenCalledOnce();
    expect(service.create).not.toHaveBeenCalled(); expect(service.edit).not.toHaveBeenCalled(); expect(service.recover).not.toHaveBeenCalled();
  });

  it('retains query-first and explicit original-request recovery without automatic replay', async () => {
    const pending: AutomationIntent = { ruleId: rule.ruleId, operation: 'retire', body: { expectedRevision: 7 } };
    service.state.update(s => ({ ...s, pending: [pending] })); render();
    const pendingCard = fixture.nativeElement.querySelector('.pending-card') as HTMLElement;
    expect(pendingCard.textContent).toContain('删除待确认');
    expect(pendingCard.querySelector('details')?.open).toBe(false);
    expect(pendingCard.querySelector('code')?.textContent).toBe('one');
    expect(button('启用').disabled).toBe(true); expect(button('编辑').disabled).toBe(true);
    expect(service.recover).not.toHaveBeenCalled();
    button('查询原请求').click(); await fixture.whenStable();
    expect(service.recover).toHaveBeenCalledExactlyOnceWith(pending);
    button('恢复同一请求').click(); await fixture.whenStable();
    expect(service.recover).toHaveBeenLastCalledWith(pending, true);
    expect(service.recover).toHaveBeenCalledTimes(2);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('groups the editor into name, condition and action without changing empty numeric or explicit zero semantics', async () => {
    page.startCreate(); page.name = '有效名称'; page.source = 'source:1'; page.target = 'target:2'; page.value = ''; render();
    const sections = [...fixture.nativeElement.querySelectorAll('.editor > .form-section')] as HTMLElement[];
    expect(sections.map(section => section.getAttribute('aria-label'))).toEqual(['自动化名称', '自动化条件', '自动化动作']);
    expect(sections[0].querySelector('ion-input[label="名称"]')?.getAttribute('maxlength')).toBe('80');
    expect(sections[1].querySelector('ion-select[label="源属性"]')).not.toBeNull();
    expect(sections[2].querySelector('ion-select[label="目标属性"]')).not.toBeNull();
    expect(sections[2].querySelector('ion-input[label="目标值"]')).not.toBeNull();
    expect(button('保存自动化').disabled).toBe(true);
    const input = sections[2].querySelector('ion-input[label="目标值"]') as HTMLElement & { value: string };
    input.value = '0'; input.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: '0' } }));
    await fixture.whenStable(); render();
    expect(page.targetValue).toBe(0); expect(button('保存自动化').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('新建后先保存为未启用');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('preserves the immutable endpoints, revision and enabled definition while editing', () => {
    page.view = 'editor'; page.editing = rule; page.name = rule.name!; page.value = 0; render();
    expect(fixture.nativeElement.querySelector('ion-select[label="源属性"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-select[label="目标属性"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('保留原设备与属性');
    expect(fixture.nativeElement.textContent).toContain('保存后保留原启停状态');
    expect(rule.definitionRevision).toBe(7); expect(rule.target.value).toBe(0); expect(rule.enabled).toBe(false);
    expect(button('保存修改').disabled).toBe(false);
    service.state.update(s => ({ ...s, busy: true })); render();
    expect(button('保存修改').disabled).toBe(true); expect(button('取消').disabled).toBe(true);
    for (const input of fixture.nativeElement.querySelectorAll('ion-input, ion-select')) expect(input.disabled).toBe(true);
  });

  it('keeps UNKNOWN, execution confirmation semantics and tracking action reachable in detail', () => {
    const pending: AutomationIntent = { ruleId: rule.ruleId, operation: 'retire', body: { expectedRevision: 7 } };
    page.view = 'detail';
    service.state.update(s => ({ ...s, detail: { rule: { ...rule, targetOutcomeUnknown: true }, recentExecutions: [
      { executionId: 'ack', definitionRevision: 7, state: 'acknowledged', createdAtMs: 1, updatedAtMs: 2 },
      { executionId: 'unknown', definitionRevision: 7, state: 'outcome_unknown', createdAtMs: 3, updatedAtMs: 4 },
    ] }, reviewed: pending })); render();
    const warning = fixture.nativeElement.querySelector('.rule-detail [role="status"]') as HTMLElement;
    expect(warning.textContent).toContain('不会自动重发');
    const history = fixture.nativeElement.querySelector('.execution-history') as HTMLElement;
    expect(history.textContent).toContain('不代表实物动作已完成');
    expect(history.textContent).toContain('设备已确认'); expect(history.textContent).toContain('结果未知，不自动重发');
    expect(button('已核对，停止本机跟踪').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.rule-detail details code')?.textContent).toBe('one');
    expect(service.recover).not.toHaveBeenCalled(); expect(service.acceptChanged).not.toHaveBeenCalled();
  });

  it('retains empty/history and support information without initiating work on render', () => {
    service.state.update(s => ({ ...s, rules: [], retired: true })); render();
    expect(fixture.nativeElement.querySelector('.workflow-empty')?.textContent).toContain('暂无已删除记录');
    expect(fixture.nativeElement.querySelector('.help details')).toBeNull();
    expect(fixture.nativeElement.querySelector('.help summary')?.textContent).toBe('使用说明与支持范围');
    expect(button('查看原场景配置（仅存档）').getAttribute('routerlink')).toBe('/scene-archive');
    expect(service.open).not.toHaveBeenCalled(); expect(service.refresh).not.toHaveBeenCalled(); expect(service.create).not.toHaveBeenCalled();
  });

  it('keeps the existing close lifecycle rather than creating page-level background work', () => {
    page.ionViewWillLeave();
    expect(service.close).toHaveBeenCalledOnce(); expect(page.view).toBe('list');
    expect(service.open).not.toHaveBeenCalled(); expect(service.refresh).not.toHaveBeenCalled(); expect(service.recover).not.toHaveBeenCalled();
  });
});
