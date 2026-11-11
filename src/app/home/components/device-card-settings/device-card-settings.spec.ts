import { NgTemplateOutlet } from '@angular/common';
import { Component, ContentChild, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { IonicModule } from '@ionic/angular';
import { IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API } from '../../../configs/api.config';
import { DeviceUiEndpoint, DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { BlinkerDevice } from '../../../core/model/device.model';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceCardEditor } from '../../device-card-editor.service';
import { HomeCardBinding, HomeCardPreferencesStore } from '../../device-card-preferences';
import { deviceCardMetrics } from '../deviceblock/device-card-presentation';
import { Deviceblock } from '../deviceblock/deviceblock';
import { DeviceCardSettingsPanel } from './device-card-settings';

@Component({ selector: 'ion-modal', imports: [NgTemplateOutlet], template: '<ng-container [ngTemplateOutlet]="content"></ng-container>' })
class ModalStub {
  private open = false;
  holdDismissal = false;
  @Input() set isOpen(value: boolean) {
    const closing = this.open && !value;
    this.open = value;
    if (closing) queueMicrotask(() => { if (!this.holdDismissal) this.didDismiss.emit(); });
  }
  get isOpen(): boolean { return this.open; }
  @ContentChild(TemplateRef, { static: true }) content!: TemplateRef<unknown>;
  @Output() didDismiss = new EventEmitter<void>();
}

@Component({ selector: 'deviceblock', template: '' })
class PreviewStub {
  @Input() device?: BlinkerDevice;
  @Input() wide = false;
  @Input() bindings?: readonly HomeCardBinding[];
  @Input() controlsEnabled = false;
  @Output() capacityChange = new EventEmitter<number>();
  @Output() rangeCapacityChange = new EventEmitter<boolean>();
}

const temperature: HomeCardBinding = { key: 'temperature', kind: 0, type: 3 };
const power: HomeCardBinding = { key: 'power', kind: 0, type: 0 };
const level: HomeCardBinding = { key: 'level', kind: 0, type: 2 };
const text: HomeCardBinding = { key: 'text', kind: 0, type: 5 };
const initial = [temperature, power];

function memory() {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn((key: string): string | null => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string): void => { values.set(key, value); }) };
}

function snapshot(): DeviceUiSnapshot {
  const field = (key: string, type: DeviceUiEndpoint['manifestType'], valueType: DeviceUiEndpoint['valueType'],
    value: DeviceUiEndpoint['value'], extra: Partial<DeviceUiEndpoint> = {}): DeviceUiEndpoint => ({
      id: 1, key, manifestKind: 0, manifestType: type, role: 'property', valueType,
      readable: true, writable: false, notifies: true, value, ...extra,
    });
  return { manifestRevision: 1, manifestFingerprint: 'ab', manifestAccepted: true,
    stateRevision: 1, stateFresh: true, endpoints: [
      field('temperature', 3, 'number', 0, { unit: '℃' }), field('power', 0, 'boolean', false, { writable: true }),
      field('level', 2, 'integer', 5, { writable: true, minimum: 0, maximum: 100, step: 5 }), field('text', 5, 'text', 'OK'),
      field('private', 3, 'number', 100, { readable: false, writable: true }),
      field('action', 3, 'number', 1, { manifestKind: 1, role: 'action' }),
      field('bytes', 6, 'bytes', new Uint8Array([1])),
      field('event', 0, 'boolean', true, { manifestKind: 2, role: 'event' }),
      field('run', 0, 'boolean', undefined, { manifestKind: 1, role: 'action', readable: false, writable: true, notifies: false }),
      field('reset', 9, 'null', undefined, { manifestKind: 1, role: 'action', readable: false, writable: true, notifies: false }),
    ].map((value, id) => ({ ...value, id: id + 1 })) };
}

// Production panel template, nested editor and preference store are retained.
// Only modal projection, preview rendering, cached state, account data and storage are doubles.
describe('home card settings nested draft (production template, explicit local doubles)', () => {
  let fixture: ComponentFixture<DeviceCardSettingsPanel>;
  let panel: DeviceCardSettingsPanel;
  let editor: DeviceCardEditor;
  let values: Map<string, string>;
  let storage: ReturnType<typeof memory>;
  let states: Record<string, BehaviorSubject<DeviceUiSnapshot>>;
  let ui: { watchState: ReturnType<typeof vi.fn> };
  let foreground: BehaviorSubject<boolean>;
  let lastCapacity: number;
  let lastRangeFits: boolean;
  let data: {
    auth: { uuid: string }; sessionEpoch: number;
    device: { list: string[]; dict: Record<string, BlinkerDevice> };
    room: { list: string[]; dict: Record<string, string[]> };
    authDataChanged: Subject<void>; deviceDataLoader: BehaviorSubject<boolean>; userDataLoader: BehaviorSubject<boolean>;
  };

  beforeEach(async () => {
    storage = memory(); values = storage.values;
    lastCapacity = 4; lastRangeFits = false;
    vi.stubGlobal('localStorage', storage);
    const device = (id: string): BlinkerDevice => ({ deviceName: id, name: '原名称',
      config: { card: { layout: 'standard', metrics: [] } },
      displayMetadata: { logicalDeviceId: id, revision: 1, name: '客厅温控', capabilities: [
        { ...temperature, displayName: '温度' }, { ...power, displayName: '电源', trueLabel: '开启', falseLabel: '关闭' },
        { ...level, displayName: '亮度' }, { ...text, displayName: '提示' },
      ] }, data: {}, subject: new Subject(),
    }) as BlinkerDevice;
    data = { auth: { uuid: 'panel-owner' }, sessionEpoch: 1,
      device: { list: ['a', 'b'], dict: { a: device('a'), b: device('b') } },
      room: { list: ['客厅'], dict: { 客厅: ['a', 'b'] } },
      authDataChanged: new Subject(), deviceDataLoader: new BehaviorSubject(true), userDataLoader: new BehaviorSubject(true) };
    states = { a: new BehaviorSubject(snapshot()), b: new BehaviorSubject(snapshot()) };
    ui = { watchState: vi.fn((id: string) => states[id]) };
    foreground = new BehaviorSubject(true);
    TestBed.overrideComponent(DeviceCardSettingsPanel, {
      remove: { imports: [IonicModule, Deviceblock] },
      add: { imports: [ModalStub, PreviewStub, IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonContent] },
    });
    await TestBed.configureTestingModule({ imports: [DeviceCardSettingsPanel], providers: [
      DeviceCardEditor, provideIonicAngular({ animated: false }),
      { provide: DataService, useValue: data }, { provide: DeviceUiPort, useValue: ui },
      { provide: AppVisibilityService, useValue: { active: foreground } },
    ] }).compileComponents();
    editor = TestBed.inject(DeviceCardEditor);
    fixture = TestBed.createComponent(DeviceCardSettingsPanel); panel = fixture.componentInstance;
    await settled();
  });

  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  async function settled(): Promise<void> {
    fixture.detectChanges(); await fixture.whenStable();
    fixture.detectChanges(); await fixture.whenStable();
  }

  function seed(bindings: HomeCardBinding[] | undefined = initial): void {
    const store = new HomeCardPreferencesStore(storage, { authority: API.BASE_URL, accountId: data.auth.uuid });
    const baseline = store.load();
    store.save({ ...baseline.value, orders: { all: ['b', 'a'], 'room:%E5%AE%A2%E5%8E%85': ['a', 'b'] },
      slots: bindings === undefined ? {} : { a: bindings.map(binding => ({ ...binding })) } }, baseline.raw);
    storage.setItem.mockClear();
  }

  async function open(bindings: HomeCardBinding[] = initial, columns = 4): Promise<void> {
    seed(bindings);
    expect(editor.begin(undefined, ['a', 'b'], 'a')).toBe(true);
    editor.openSettings('a'); await settled(); await capacity(columns);
  }

  function preview(): PreviewStub {
    return fixture.debugElement.query(By.directive(PreviewStub)).componentInstance;
  }

  async function capacity(columns: number): Promise<void> {
    lastCapacity = columns;
    preview().capacityChange.emit(columns); await settled();
  }

  async function rangeFits(fits: boolean): Promise<void> {
    lastRangeFits = fits;
    preview().rangeCapacityChange.emit(fits); await settled();
  }

  function button(label: string): HTMLElement & { disabled?: boolean } {
    const found = [...fixture.nativeElement.querySelectorAll('button, ion-button')]
      .find((element: HTMLElement) => element.getAttribute('aria-label') === label || element.textContent?.trim() === label);
    expect(found, label).toBeDefined(); return found;
  }

  async function click(label: string): Promise<void> {
    const target = button(label); expect(target.disabled).not.toBe(true); target.click(); await settled();
    // Explicit layout/measurement double: a real preview remeasures after a size change.
    if (label === '长卡' || label === '标准卡') { await capacity(lastCapacity); await rangeFits(lastRangeFits); }
  }

  function select(label: string): HTMLSelectElement {
    const found = fixture.nativeElement.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null;
    expect(found, label).not.toBeNull(); return found!;
  }

  async function choose(label: string, binding: HomeCardBinding): Promise<void> {
    const target = select(label); expect(target.disabled).toBe(false);
    target.value = panel.reference(binding); target.dispatchEvent(new Event('change', { bubbles: true })); await settled();
  }

  async function chooseMode(label: string, value: string): Promise<void> {
    const target = select(label); expect(target.disabled).toBe(false);
    target.value = value; target.dispatchEvent(new Event('change', { bubbles: true })); await settled();
  }

  function expectSelectedBindings(): void {
    for (const [index, binding] of (panel.panel()?.bindings ?? []).entries()) {
      const mode = select(`第${index + 1}个小块类型`), field = select(`第${index + 1}个数据块`);
      expect(mode.value).toBe(binding.mode ?? 'read');
      expect([...mode.options].filter(option => option.selected).map(option => option.value)).toEqual([binding.mode ?? 'read']);
      expect(field.value).toBe(panel.reference(binding));
      expect([...field.options].filter(option => option.selected).map(option => option.value)).toEqual([panel.reference(binding)]);
    }
  }

  it('offers readable scalar Properties only and delegates aliased names, zero and false to the existing preview', async () => {
    await open();
    expect(fixture.nativeElement.querySelector('h2')?.textContent).toBe('客厅温控');
    expect(panel.fields().map(field => field.key)).toEqual(['temperature', 'power', 'level', 'text']);
    expect([...select('添加底部小块').options].map(option => option.textContent)).toEqual(['选择能力', '亮度', '提示']);
    expect(preview().device).toBe(data.device.dict['a']); expect(preview().bindings).toEqual(initial);
    expect(deviceCardMetrics(preview().device, states['a'].value, preview().bindings).map(metric => metric.display)).toEqual(['0', '关闭']);
    expect(Object.keys(ui)).toEqual(['watchState']); expect(ui.watchState).toHaveBeenCalledWith('a');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('selects saved control modes and full endpoint identities when dynamic rows mount and reopen', async () => {
    const bindings: HomeCardBinding[] = [{ ...power, mode: 'toggle' },
      { key: 'reset', kind: 1, type: 9, mode: 'action' }, { ...level, mode: 'range' }];
    await open(bindings); await rangeFits(true);
    expectSelectedBindings();
    expect(select('第2个数据块').selectedOptions[0].textContent).toBe('reset');
    expect(select('第3个数据块').selectedOptions[0].textContent).toBe('亮度');
    await click('取消'); editor.openSettings('a'); await settled(); await capacity(4); await rangeFits(true);
    expectSelectedBindings(); expect(editor.bindings('a')).toEqual(bindings);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps endpoint selections aligned after row reordering, replacement and candidate-list changes', async () => {
    await open([temperature, power, level]); expectSelectedBindings();
    await click('上移亮度'); expectSelectedBindings();
    expect(select('第2个数据块').value).toBe(panel.reference(level));
    expect(select('第3个数据块').value).toBe(panel.reference(power));
    await choose('第1个数据块', text); expectSelectedBindings();
    await chooseMode('第3个小块类型', 'toggle'); expectSelectedBindings();
    expect([...select('第3个数据块').options].map(option => option.value)).toEqual([panel.reference(power)]);
    states['a'].next({ ...states['a'].value, endpoints: [...states['a'].value.endpoints].reverse() }); await settled();
    expectSelectedBindings();
    expect(panel.panel()?.bindings).toEqual([text, level, { ...power, mode: 'toggle' }]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('adds, replaces, moves, removes and clears only the panel subdraft', async () => {
    await open();
    const original = JSON.stringify({ device: data.device.dict['a'].config, room: data.room });
    await choose('添加底部小块', text);
    await choose('第3个数据块', level);
    await click('上移亮度');
    expect(panel.panel()?.bindings?.map(binding => binding.key)).toEqual(['temperature', 'level', 'power']);
    await click('移除温度');
    expect(panel.panel()?.bindings?.map(binding => binding.key)).toEqual(['level', 'power']);
    await click('清空底部数据'); expect(panel.panel()?.bindings).toEqual([]);
    expect(editor.bindings('a')).toEqual(initial); expect(editor.dirty()).toBe(false);
    expect(JSON.stringify({ device: data.device.dict['a'].config, room: data.room })).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('cancels panel changes without mutating the outer draft or writing preferences', async () => {
    await open(); await click('长卡'); await choose('添加底部小块', level); await click('取消');
    expect(panel.panel()).toBeNull(); expect(editor.settingsId()).toBeNull();
    expect(editor.editing()).toBe(true); expect(editor.layout('a')).toBe('standard');
    expect(editor.bindings('a')).toEqual(initial); expect(editor.dirty()).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('applies Done to the outer draft and writes once only after the outer top-level Save', async () => {
    await open(); await click('长卡'); await choose('添加底部小块', text); await click('完成');
    expect(panel.panel()).toBeNull(); expect(editor.editing()).toBe(true);
    expect(editor.layout('a')).toBe('wide'); expect(editor.bindings('a')).toEqual([...initial, text]);
    expect(editor.dirty()).toBe(true); expect(storage.setItem).not.toHaveBeenCalled();
    expect(editor.save()).toBe(true); expect(storage.setItem).toHaveBeenCalledOnce();
    const saved = JSON.parse([...values.values()][0]);
    expect(saved.slots.a).toEqual([...initial, text]); expect(saved.layouts.a).toBe('wide');
    expect(saved.orders.all).toEqual(['b', 'a']);
  });

  it('saves through the single-device settings entrance without rewriting any view order', async () => {
    seed([]); const before = JSON.parse([...values.values()][0]).orders;
    expect(editor.beginSingle('a')).toBe(true); editor.openSettings('a'); await settled(); await capacity(2);
    await choose('添加底部小块', temperature); await choose('添加底部小块', power); await click('保存');
    expect(editor.editing()).toBe(false); expect(storage.setItem).toHaveBeenCalledOnce();
    const saved = JSON.parse([...values.values()][0]);
    expect(saved.orders).toEqual(before); expect(saved.slots.a).toEqual(initial);
  });

  it('does not silently turn unresolved legacy references into an empty row without a Manifest', async () => {
    data.device.dict['a'].config.card!.metrics = [{ key: 'temperature' }];
    seed(undefined);
    // Delete only the test seed's explicit slot; the legacy source itself remains untouched.
    const storedKey = [...values.keys()][0], stored = JSON.parse(values.get(storedKey)!);
    delete stored.slots.a; values.set(storedKey, JSON.stringify(stored));
    states['a'].next({ ...states['a'].value, manifestAccepted: false });
    expect(editor.begin(undefined, ['a', 'b'], 'a')).toBe(true); editor.openSettings('a'); await settled(); await capacity(4);
    expect(panel.fields()).toEqual([]); expect(panel.panel()?.bindings).toBeUndefined();
    expect(panel.unresolvedLegacy()).toBe(true); expect(select('添加底部小块').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('旧数据引用暂无法完整核对');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('尚无已授权');
    await click('完成'); expect(editor.bindings('a')).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(data.device.dict['a'].config.card!.metrics).toEqual([{ key: 'temperature' }]);
  });

  it('keeps a single-card panel and its draft after a storage failure, allowing a clean retry', async () => {
    seed([]); expect(editor.beginSingle('a')).toBe(true); editor.openSettings('a');
    await settled(); await capacity(2); await choose('添加底部小块', power);
    const before = [...values.values()];
    storage.setItem.mockImplementationOnce(() => { throw Error('quota'); });
    await click('保存');
    expect(editor.editing()).toBe(true); expect(editor.settingsId()).toBe('a');
    expect(panel.panel()?.bindings).toEqual([power]); expect([...values.values()]).toEqual(before);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('未保存');
    await click('保存');
    expect(editor.editing()).toBe(false); expect(panel.panel()).toBeNull();
    expect(JSON.parse([...values.values()][0]).slots.a).toEqual([power]);
  });

  it('keeps unavailable full references and over-capacity bindings instead of rebinding or dropping them', async () => {
    states['a'].next({ ...states['a'].value, endpoints: states['a'].value.endpoints.map(field => field.key === 'temperature'
      ? { ...field, manifestType: 4 as const } : field) });
    const saved = [temperature, power, level, text]; await open(saved, 2);
    expect(panel.available(temperature)).toBe(false); expect(panel.panel()?.bindings).toEqual(saved);
    expect(select('第1个数据块').selectedOptions[0].textContent).toContain('能力不可用，已保留');
    expect(fixture.nativeElement.textContent).toContain('配置已保留');
    expect(select('添加底部小块').disabled).toBe(true);
    await capacity(1); expect(panel.panel()?.bindings).toEqual(saved);
    await click('完成'); expect(editor.bindings('a')).toEqual(saved);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('prevents adding beyond actual capacity and does not remove configured bindings after narrowing', async () => {
    await open([], 2); await choose('添加底部小块', temperature); await choose('添加底部小块', power);
    expect(panel.canAdd()).toBe(false); expect(select('添加底部小块').disabled).toBe(true);
    panel.add(panel.reference(text)); await settled(); expect(panel.panel()?.bindings).toEqual(initial);
    await capacity(4); await choose('添加底部小块', text);
    await capacity(1); expect(panel.panel()?.bindings).toEqual([...initial, text]); expect(panel.canAdd()).toBe(false);
    expect(editor.bindings('a')).toEqual([]); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('retains but disables the subdraft while backgrounded and resumes without a write', async () => {
    await open(); const before = structuredClone(panel.panel());
    foreground.next(false); await settled();
    expect(panel.enabled()).toBe(false);
    expect((fixture.nativeElement.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    panel.setLayout('wide'); panel.remove(0); panel.add(panel.reference(text)); panel.done(); await settled();
    expect(panel.panel()).toEqual(before); expect(editor.bindings('a')).toEqual(initial);
    expect(storage.setItem).not.toHaveBeenCalled();
    foreground.next(true); await settled(); expect(panel.enabled()).toBe(true); expect(panel.panel()).toEqual(before);
  });

  it('isolates a stale modal dismissal and state owner after a successor account/settings generation opens', async () => {
    await open();
    const oldModal = fixture.debugElement.query(By.directive(ModalStub)).componentInstance as ModalStub;
    const old = { ...panel.panel()! };
    data.auth = { uuid: 'next-panel-owner' }; data.sessionEpoch++; data.authDataChanged.next();
    expect(editor.beginSingle('b')).toBe(true); editor.openSettings('b'); await settled();
    expect(editor.settingsGeneration()).not.toBe(old.generation);
    expect(states['a'].observed).toBe(false); expect(states['b'].observed).toBe(true);
    oldModal.didDismiss.emit(); panel.dismissed(old.id, old.generation); await settled();
    expect(editor.settingsId()).toBe('b'); expect(panel.panel()?.id).toBe('b'); expect(editor.editing()).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps the same modal mounted with isOpen false until Ionic emits didDismiss after Done', async () => {
    await open();
    const modal = fixture.debugElement.query(By.directive(ModalStub)).componentInstance as ModalStub;
    const before = panel.panel()!;
    modal.holdDismissal = true;
    await click('长卡'); await click('完成');
    expect(editor.settingsId()).toBeNull(); expect(editor.editing()).toBe(true);
    expect(panel.modalOpen()).toBe(false); expect(panel.enabled()).toBe(false);
    expect(panel.panel()?.generation).toBe(before.generation);
    expect(fixture.debugElement.query(By.directive(ModalStub)).componentInstance).toBe(modal);
    expect(modal.isOpen).toBe(false); expect(states['a'].observed).toBe(false);
    expect(editor.layout('a')).toBe('wide'); expect(storage.setItem).not.toHaveBeenCalled();
    modal.didDismiss.emit(); await settled();
    expect(panel.panel()).toBeNull(); expect(fixture.debugElement.query(By.directive(ModalStub))).toBeNull();
    expect(editor.editing()).toBe(true); expect(editor.layout('a')).toBe('wide');
  });

  it('finishes cancellation through Ionic before removing the modal, without persisting its subdraft', async () => {
    await open();
    const modal = fixture.debugElement.query(By.directive(ModalStub)).componentInstance as ModalStub;
    modal.holdDismissal = true;
    await click('长卡'); await click('取消');
    expect(modal.isOpen).toBe(false); expect(panel.panel()).not.toBeNull();
    expect(panel.enabled()).toBe(false); expect(editor.layout('a')).toBe('standard');
    expect(editor.bindings('a')).toEqual(initial); expect(storage.setItem).not.toHaveBeenCalled();
    modal.didDismiss.emit(); await settled();
    expect(panel.panel()).toBeNull(); expect(editor.editing()).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('waits for old dismissal before opening only the latest successor and ignores a delayed old event', async () => {
    await open();
    const oldModal = fixture.debugElement.query(By.directive(ModalStub)).componentInstance as ModalStub;
    const old = { ...panel.panel()! }; oldModal.holdDismissal = true;
    editor.openSettings('b'); await settled();
    expect(panel.panel()?.id).toBe('a'); expect(panel.modalOpen()).toBe(false);
    expect(panel.enabled()).toBe(false); expect(states['a'].observed).toBe(false);
    expect(states['b'].observed).toBe(false);
    panel.clear(); panel.done(); expect(editor.settingsId()).toBe('b');
    oldModal.didDismiss.emit(); await settled();
    expect(panel.panel()?.id).toBe('b'); expect(panel.modalOpen()).toBe(true);
    expect(states['b'].observed).toBe(true);
    const successor = fixture.debugElement.query(By.directive(ModalStub)).componentInstance as ModalStub;
    expect(successor).not.toBe(oldModal);
    panel.dismissed(old.id, old.generation); await settled();
    expect(editor.settingsId()).toBe('b'); expect(panel.panel()?.id).toBe('b');
    expect(panel.modalOpen()).toBe(true); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('treats a native backdrop dismissal as cancel and never writes the nested draft', async () => {
    await open(); await click('长卡');
    const modal = fixture.debugElement.query(By.directive(ModalStub)).componentInstance as ModalStub;
    modal.didDismiss.emit(); await settled();
    expect(panel.panel()).toBeNull(); expect(panel.modalOpen()).toBe(false);
    expect(editor.settingsId()).toBeNull(); expect(editor.layout('a')).toBe('standard');
    expect(editor.editing()).toBe(true); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('requires explicit mode changes, preserves mode on replacement and configures all controls without dispatch', async () => {
    const second: HomeCardBinding = { key: 'second', kind: 0, type: 0 };
    states['a'].next({ ...states['a'].value, endpoints: [...states['a'].value.endpoints,
      { ...states['a'].value.endpoints[1], id: 20, key: 'second' }] });
    await open([power], 4);
    expect(panel.mode(panel.panel()!.bindings![0])).toBe('read');
    await chooseMode('第1个小块类型', 'toggle');
    await choose('第1个数据块', second);
    expect(panel.panel()?.bindings).toEqual([{ ...second, mode: 'toggle' }]);
    panel.setMode(0, 'action'); await settled();
    expect(panel.panel()?.bindings).toEqual([{ ...second, mode: 'toggle' }]);
    await chooseMode('新增小块类型', 'action');
    await choose('添加底部小块', { key: 'reset', kind: 1, type: 9 });
    await rangeFits(true); await chooseMode('新增小块类型', 'range');
    await choose('添加底部小块', level);
    expect(panel.usedColumns()).toBe(4); expect(panel.canAdd()).toBe(false);
    expect(preview().controlsEnabled).toBe(false);
    const expected = [{ ...second, mode: 'toggle' }, { key: 'reset', kind: 1, type: 9, mode: 'action' }, { ...level, mode: 'range' }];
    expect(panel.panel()?.bindings).toEqual(expected);
    await click('完成'); expect(editor.bindings('a')).toEqual(expected);
    expect(Object.keys(ui)).toEqual(['watchState']); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not offer new controls to a viewer and retains unavailable saved control modes', async () => {
    data.device.dict['a'].config.isShared = true;
    data.device.dict['a'].data.canCommand = false;
    const toggle = { ...power, mode: 'toggle' as const };
    await open([toggle], 2);
    expect(panel.available(toggle)).toBe(false);
    for (const mode of ['toggle', 'action', 'range']) {
      expect([...select('新增小块类型').options].find(option => option.value === mode)?.disabled).toBe(true);
      panel.setAddMode(mode); expect(panel.addMode()).toBe('read');
    }
    expect(panel.panel()?.bindings).toEqual([toggle]);
    expect(select('第1个数据块').selectedOptions[0].textContent).toContain('能力不可用，已保留');
    await click('完成'); expect(editor.bindings('a')).toEqual([toggle]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('uses endpoint-scoped operator permission when listing control choices', async () => {
    data.device.dict['a'].config.isShared = true;
    data.device.dict['a'].data.canCommand = true;
    data.device.dict['a'].data.commandEndpointKeys = ['power'];
    await open([], 4); await chooseMode('新增小块类型', 'toggle');
    expect(panel.candidates().map(field => field.key)).toEqual(['power']);
    expect(panel.canSelectAddMode('action')).toBe(false);
    await choose('添加底部小块', power);
    expect(panel.panel()?.bindings).toEqual([{ ...power, mode: 'toggle' }]);
    await click('取消'); expect(editor.bindings('a')).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('requires measured 140px range fit and preserves a configured range when narrowed', async () => {
    await open([], 4);
    expect(panel.canSelectAddMode('range')).toBe(false);
    panel.setAddMode('range'); expect(panel.addMode()).toBe('read');
    await rangeFits(true); await chooseMode('新增小块类型', 'range');
    await choose('添加底部小块', level);
    expect(panel.panel()?.bindings).toEqual([{ ...level, mode: 'range' }]);
    await capacity(1); await rangeFits(false);
    expect(panel.usedColumns()).toBe(2); expect(panel.panel()?.bindings).toEqual([{ ...level, mode: 'range' }]);
    await click('完成');
    expect(editor.settingsId()).toBe('a'); expect(editor.bindings('a')).toEqual([]);
    expect(editor.error()).toContain('宽度不足'); expect(storage.setItem).not.toHaveBeenCalled();
    await capacity(4); await rangeFits(true); await click('完成');
    expect(editor.bindings('a')).toEqual([{ ...level, mode: 'range' }]);
  });

  it('keeps a control subdraft after failed single-card Save and does not invoke preview controls', async () => {
    seed([power]); expect(editor.beginSingle('a')).toBe(true); editor.openSettings('a');
    await settled(); await capacity(2); await chooseMode('第1个小块类型', 'toggle');
    storage.setItem.mockImplementationOnce(() => { throw Error('quota'); });
    await click('保存');
    expect(panel.panel()?.bindings).toEqual([{ ...power, mode: 'toggle' }]);
    expect(editor.editing()).toBe(true); expect(editor.error()).toContain('未保存');
    expect(preview().controlsEnabled).toBe(false); expect(Object.keys(ui)).toEqual(['watchState']);
    await click('保存'); expect(editor.editing()).toBe(false);
    expect(JSON.parse([...values.values()][0]).slots.a).toEqual([{ ...power, mode: 'toggle' }]);
  });
});
