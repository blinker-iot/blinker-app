import { NgTemplateOutlet } from '@angular/common';
import { Component, ContentChild, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonModal, IonPopover, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import type { LegacyBinding } from '../../../core/device-v2/legacy-panel';
import type { PanelDocument } from '../../../core/device-v2/panel-document';
import type { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceConsoleService } from '../../../core/services/device-console.service';
import { DevicePanelService } from '../../../core/services/device-panel.service';
import { DeviceService } from '../../../core/services/device.service';
import { DeviceV2PageLayoutService } from '../../../core/services/device-v2-page-layout.service';
import { NoticeService } from '../../../core/services/notice.service';
import { ViewService } from '../../../core/services/view.service';
import { PageWidgetComponent } from '../../../device/v2/panel/page-widget';
import type { EmbeddedPanelSession } from './embedded-panel-session';
import { InlineWidgetPropertiesComponent } from './inline-widget-properties';
import { PanelEditorPage } from './panel-editor.page';
import { PanelSortableDirective, PanelSortItemDirective } from './panel-sortable.directive';
import { PanelWidgetEditorContextService } from './panel-widget-editor-context.service';

// Keep the production editor, sortable, widgets and property templates. Only
// Ionic overlay portals are projected locally: JSDOM cannot verify native
// overlay placement, viewport geometry or platform animations.
@Component({ selector: 'ion-modal', imports: [NgTemplateOutlet], template: '@if (isOpen) { <ng-container [ngTemplateOutlet]="content" /> }' })
class LocalModal {
  @Input() isOpen = false;
  @Input() canDismiss: boolean | ((data?: unknown, role?: string) => boolean | Promise<boolean>) = true;
  @ContentChild(TemplateRef, { static: true }) content!: TemplateRef<unknown>;
  @Output() didDismiss = new EventEmitter<void>();
  async dismiss(role = 'backdrop'): Promise<boolean> {
    const allowed = typeof this.canDismiss === 'function' ? await this.canDismiss(undefined, role) : this.canDismiss;
    if (allowed) this.didDismiss.emit();
    return allowed;
  }
}

@Component({ selector: 'ion-popover', imports: [NgTemplateOutlet], template: '<ng-container [ngTemplateOutlet]="content" />' })
class LocalPopover {
  @Input() trigger = '';
  @Input() size = '';
  @Input() side = '';
  @Input() alignment = '';
  @Input() arrow = false;
  @Input() showBackdrop = false;
  @ContentChild(TemplateRef, { static: true }) content!: TemplateRef<unknown>;
  dismiss(): Promise<void> { return Promise.resolve(); }
}

describe('embedded editor production template', () => {
  const id = 'inline-render-device', fingerprint = 'cd'.repeat(32);
  let fixture: ComponentFixture<PanelEditorPage> | undefined;
  let data: { auth: { uuid: string }; user: { id: string }; sessionEpoch: number;
    device: { dict: Record<string, BlinkerDevice> }; userDataLoader: BehaviorSubject<boolean> };
  let port: { appActive: BehaviorSubject<boolean>; openConnection: ReturnType<typeof vi.fn>;
    watchState: ReturnType<typeof vi.fn>; watchConnection: ReturnType<typeof vi.fn>; sendCommand: ReturnType<typeof vi.fn> };
  let nav: { navigateForward: ReturnType<typeof vi.fn>; navigateBack: ReturnType<typeof vi.fn> };
  let layouts: { get: ReturnType<typeof vi.fn>; saveCandidate: ReturnType<typeof vi.fn> };
  let panels: { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; install: ReturnType<typeof vi.fn> };
  let consoles: { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let devices: { sendData: ReturnType<typeof vi.fn>; saveDeviceConfig: ReturnType<typeof vi.fn>; islocalDevice: ReturnType<typeof vi.fn> };
  let alerts: { create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    localStorage.removeItem(`blinker-device-theme:${id}`);
    data = { auth: { uuid: 'inline-render-account' }, user: { id: 'inline-render-account' }, sessionEpoch: 1,
      device: { dict: {} }, userDataLoader: new BehaviorSubject(true) };
    port = { appActive: new BehaviorSubject(true), openConnection: vi.fn(), watchState: vi.fn(),
      watchConnection: vi.fn(), sendCommand: vi.fn() };
    nav = { navigateForward: vi.fn(), navigateBack: vi.fn() };
    layouts = { get: vi.fn(), saveCandidate: vi.fn() };
    panels = { get: vi.fn(), save: vi.fn(), install: vi.fn() };
    consoles = { get: vi.fn(), save: vi.fn() };
    devices = { sendData: vi.fn(), saveDeviceConfig: vi.fn(), islocalDevice: vi.fn(() => false) };
    alerts = { create: vi.fn() };
    TestBed.overrideComponent(PanelEditorPage, {
      remove: { imports: [IonModal, IonPopover] }, add: { imports: [LocalModal, LocalPopover] },
    });
    await TestBed.configureTestingModule({ imports: [PanelEditorPage], providers: [
      provideIonicAngular({ animated: false }), PanelWidgetEditorContextService,
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => id } } } },
      { provide: DataService, useValue: data }, { provide: DeviceService, useValue: devices },
      { provide: DeviceUiPort, useValue: port }, { provide: DeviceV2PageLayoutService, useValue: layouts },
      { provide: DevicePanelService, useValue: panels }, { provide: DeviceConsoleService, useValue: consoles },
      { provide: NavController, useValue: nav }, { provide: AlertController, useValue: alerts },
      { provide: NoticeService, useValue: { showToast: vi.fn() } }, { provide: ViewService, useValue: { theme: 'light' } },
    ] }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy(); fixture = undefined;
    TestBed.resetTestingModule(); localStorage.removeItem(`blinker-device-theme:${id}`);
    vi.unstubAllGlobals();
  });

  function render(legacy = false, empty = false) {
    const device = { id, deviceName: id, cloudEnabled: !legacy, data: {}, storage: {}, subject: new Subject(),
      config: { mode: legacy ? 'mqtt' : 'bbp2', component: legacy ? 'Layouter2Component' : 'DeviceV2',
        customName: '模板测试', panelMode: 'normal', canEditConsole: true } } as unknown as BlinkerDevice;
    data.device.dict[id] = device;
    const document: PanelDocument = { schemaVersion: 1, columns: 8, style: 'electronic', widgets: [
      { widgetId: 'power-control', type: 'switch', endpointKey: 'power', title: '电源',
        grid: { x: 2, y: 4, width: 4, height: 2 } },
    ] };
    if (empty) document.widgets = [];
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: fingerprint,
      manifestRevision: 1, stateRevision: 3, stateFresh: true, endpoints: [
        { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true, value: false },
      ] };
    const binding: LegacyBinding = { field: snapshot.endpoints[0], source: { type: 'btn', mode: 1, key: 'power' } };
    const session: EmbeddedPanelSession = { device, document, snapshot,
      record: legacy ? undefined : { logicalDeviceId: id, revision: 7, manifestFingerprint: fingerprint,
        layout: { ...structuredClone(document), revision: 7, manifestFingerprint: fingerprint }, createdAt: 1, updatedAt: 2 },
      bindings: legacy ? { 'power-control': binding } : undefined,
      legacyRecord: legacy ? { panelId: 'legacy-render-panel', revision: 7, createdAt: 1, updatedAt: 2,
        panel: { device: { protocol: 'mqtt', source: 'test', key: id }, document: structuredClone(document),
          bindings: { 'power-control': binding }, view: 'normal' } } : undefined };
    fixture = TestBed.createComponent(PanelEditorPage);
    fixture.componentRef.setInput('embeddedSession', session);
    fixture.componentRef.setInput('liveSnapshot', snapshot);
    fixture.componentRef.setInput('hostRevision', 7);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, document, device,
      root: fixture.nativeElement as HTMLElement,
      grid: fixture.debugElement.query(By.directive(PanelSortableDirective)).injector.get(PanelSortableDirective) };
  }

  function noRemoteWork(): void {
    for (const fn of [port.openConnection, port.watchState, port.watchConnection, port.sendCommand, devices.sendData,
      devices.saveDeviceConfig, layouts.get, layouts.saveCandidate, panels.get, panels.save, consoles.get, consoles.save,
      nav.navigateForward, nav.navigateBack]) expect(fn).not.toHaveBeenCalled();
  }

  function dialog(role = 'cancel') {
    return { present: vi.fn(async () => undefined), onDidDismiss: vi.fn(async () => ({ role })),
      dismiss: vi.fn(async () => true), remove: vi.fn() };
  }

  function openProperties(f: ReturnType<typeof render>) {
    f.root.querySelector<HTMLElement>('.panel > .cell')!.click(); f.fixture.detectChanges();
    const properties = f.fixture.debugElement.query(By.directive(InlineWidgetPropertiesComponent));
    const body = properties.componentInstance as InlineWidgetPropertiesComponent;
    const modal = f.fixture.debugElement.queryAll(By.directive(LocalModal))
      .find(item => item.nativeElement.classList.contains('inline-properties-modal'))!.componentInstance as LocalModal;
    const input = (properties.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[data-title]')!;
    return { body, modal, root: properties.nativeElement as HTMLElement, input,
      title(value: string) {
        input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
        f.fixture.changeDetectorRef.markForCheck(); f.fixture.detectChanges();
      } };
  }

  type InvalidScope = 'account' | 'permission' | 'revision';
  function invalidate(f: ReturnType<typeof render>, reason: InvalidScope): void {
    if (reason === 'account') data.sessionEpoch++;
    else if (reason === 'permission') f.device.config.canEditConsole = false;
    else f.fixture.componentRef.setInput('hostRevision', 8);
    // Direct service-double mutations do not notify Angular's zoneless scheduler.
    f.fixture.changeDetectorRef.markForCheck();
    f.fixture.detectChanges();
  }

  function expectBlockedExplanation(f: ReturnType<typeof render>): void {
    expect(f.page.editBlockedReason).toContain('草稿已保留');
    expect(f.page.editBlockedReason).toMatch(/取消.*进入/);
    const workspace = f.root.querySelector<HTMLElement>('.workspace')!;
    expect(workspace.querySelector('[role="alert"]')?.textContent).toContain(f.page.editBlockedReason);
    expect([...workspace.querySelectorAll('button')].some(button => button.textContent?.includes('重新读取'))).toBe(false);
  }

  it('renders only the borrowed themed workspace, preserving grid anchors and inert real widgets', () => {
    const f = render();
    expect(f.page.editingAllowed).toBe(true);
    expect(f.root.classList.contains('inline-panel-editor')).toBe(true);
    expect(f.root.getAttribute('data-ui-theme')).toBe('electronic');
    expect(f.root.querySelectorAll('.workspace.inline-workspace')).toHaveLength(1);
    expect(f.root.querySelector('ion-header, ion-content, .mode-switch, .theme-switch, .save')).toBeNull();
    expect(f.grid.sortInline).toBe(true);
    const cell = f.root.querySelector<HTMLElement>('.panel > .cell')!;
    expect(cell.style.getPropertyValue('--col')).toBe('3');
    expect(cell.style.getPropertyValue('--row')).toBe('5');
    expect(cell.style.getPropertyValue('--span')).toBe('4');
    const widget = f.fixture.debugElement.query(By.directive(PageWidgetComponent));
    expect(widget.componentInstance.interactive).toBe(false);
    expect((widget.nativeElement as HTMLElement).hasAttribute('inert')).toBe(true);
    noRemoteWork();
  });

  it('routes an actual cell tap through sortTapped into inline properties without navigation or saving', () => {
    const f = render(), tapped = vi.fn(); f.grid.sortTapped.subscribe(tapped);
    f.root.querySelector<HTMLElement>('.panel > .cell')!.click(); f.fixture.detectChanges();
    expect(tapped).toHaveBeenCalledWith('power-control');
    expect(f.page.propertyCard?.widget.widgetId).toBe('power-control');
    const properties = f.fixture.debugElement.query(By.directive(InlineWidgetPropertiesComponent));
    expect(properties).not.toBeNull();
    expect(properties.componentInstance.disabled).toBe(false);
    expect(f.root.querySelector('ion-header, ion-content')).toBeNull();
    expect(f.page.document).toEqual(f.document); expect(f.page.dirty).toBe(false);
    noRemoteWork();
  });

  it.each(['account', 'permission', 'revision'] as const)('explains the invalid %s scope without losing the local draft or offering a false reload', reason => {
    const f = render();
    f.page.updateWidget({ ...f.page.document!.widgets[0], title: '未保存草稿' });
    const draft = structuredClone(f.page.document);
    invalidate(f, reason);
    expect(f.page.editingAllowed).toBe(false);
    expect(f.root.querySelector<HTMLButtonElement>('.add-button')!.disabled).toBe(true);
    const sortItem = f.fixture.debugElement.query(By.directive(PanelSortItemDirective)).injector.get(PanelSortItemDirective);
    expect(sortItem.sortDisabled).toBe(true);
    expectBlockedExplanation(f);
    f.grid.sortTapped.emit('power-control'); f.fixture.detectChanges();
    expect(f.page.propertyCard).toBeUndefined(); expect(f.page.libraryOpen).toBe(false);
    expect(f.page.document).toEqual(draft); expect(f.page.dirty).toBe(true); noRemoteWork();
  });

  it.each(['account', 'permission', 'revision'] as const)('shows the %s block inside open properties and preserves unapplied input', reason => {
    const f = render();
    f.root.querySelector<HTMLElement>('.panel > .cell')!.click(); f.fixture.detectChanges();
    const properties = f.fixture.debugElement.query(By.directive(InlineWidgetPropertiesComponent));
    const propertyRoot = properties.nativeElement as HTMLElement;
    const input = propertyRoot.querySelector<HTMLInputElement>('input[data-title]')!;
    input.value = '尚未应用'; input.dispatchEvent(new Event('input', { bubbles: true })); f.fixture.detectChanges();
    const propertyDraft = structuredClone(properties.componentInstance.widget);
    invalidate(f, reason);
    expectBlockedExplanation(f);
    expect(properties.componentInstance.disabled).toBe(true);
    expect(properties.componentInstance.error).toContain(f.page.editBlockedReason);
    expect(propertyRoot.querySelector('[role="alert"]')?.textContent).toContain(f.page.editBlockedReason);
    expect(propertyRoot.querySelector<HTMLButtonElement>('.apply')!.disabled).toBe(true);
    expect(propertyRoot.querySelector<HTMLButtonElement>('.remove-button')!.disabled).toBe(true);
    expect(input.disabled || input.closest('fieldset')?.disabled).toBe(true);
    propertyRoot.querySelector<HTMLButtonElement>('.apply')!.click();
    expect(properties.componentInstance.widget).toEqual(propertyDraft);
    expect(input.value).toBe('尚未应用');
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it.each(['account', 'permission', 'revision'] as const)('disables an already open display library after %s invalidation', reason => {
    const f = render();
    f.root.querySelector<HTMLButtonElement>('.add-button')!.click(); f.fixture.detectChanges();
    expect(f.root.querySelectorAll('.preset-pick').length).toBeGreaterThan(0);
    invalidate(f, reason);
    expectBlockedExplanation(f);
    expect(f.root.querySelector('.sheet [role="alert"]')?.textContent).toContain(f.page.editBlockedReason);
    expect(f.root.querySelector<HTMLButtonElement>('.field-trigger')!.disabled).toBe(true);
    const radios = [...f.root.querySelectorAll<HTMLElement & { disabled: boolean }>('ion-radio')];
    expect(radios.length).toBeGreaterThan(0); expect(radios.every(radio => radio.disabled)).toBe(true);
    const presets = [...f.root.querySelectorAll<HTMLButtonElement>('.preset-pick')];
    expect(presets.every(button => button.disabled)).toBe(true);
    presets[0].click(); f.fixture.detectChanges();
    expect(f.page.libraryOpen).toBe(true);
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it('disables the empty-canvas display entry after its scope expires', () => {
    const f = render(false, true);
    invalidate(f, 'permission');
    expectBlockedExplanation(f);
    const add = f.root.querySelector<HTMLButtonElement>('.empty-canvas button')!;
    expect(add.disabled).toBe(true); add.click();
    expect(f.page.libraryOpen).toBe(false); expect(f.page.document?.widgets).toEqual([]); noRemoteWork();
  });

  it('pauses open properties in the background without claiming a permanent scope failure', () => {
    const f = render();
    f.root.querySelector<HTMLElement>('.panel > .cell')!.click(); f.fixture.detectChanges();
    const properties = f.fixture.debugElement.query(By.directive(InlineWidgetPropertiesComponent));
    port.appActive.next(false); f.fixture.detectChanges();
    expect(f.page.editingAllowed).toBe(false); expect(f.page.editBlockedReason).toBe('');
    expect(properties.componentInstance.disabled).toBe(true);
    expect(f.root.querySelector('.workspace [role="alert"]')).toBeNull();
    expect(properties.nativeElement.querySelector('[role="alert"]')).toBeNull();
    port.appActive.next(true); f.fixture.detectChanges();
    expect(f.page.editingAllowed).toBe(true); expect(properties.componentInstance.disabled).toBe(false);
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it('retains the standalone template reload action instead of substituting the inline exit instruction', () => {
    const f = render();
    // Reuse the seeded document only to inspect the alternate production shell;
    // standalone loading and connection ownership remain covered separately.
    f.fixture.componentRef.setInput('embeddedSession', undefined);
    f.page.error = '读取失败';
    const reload = vi.spyOn(f.page, 'reload').mockResolvedValue();
    f.fixture.detectChanges();
    const button = f.root.querySelector<HTMLButtonElement>('.workspace .error button')!;
    expect(button.textContent).toContain('重新读取'); button.click();
    expect(reload).toHaveBeenCalledOnce(); noRemoteWork();
  });

  it('offers 添加展示 for an embedded legacy panel but no new-field input or __new__ option', () => {
    const f = render(true);
    expect(f.page.isV2).toBe(false);
    const add = f.root.querySelector<HTMLButtonElement>('.add-button')!;
    expect(add.textContent).toContain('添加展示'); add.click(); f.fixture.detectChanges();
    expect(f.page.libraryOpen).toBe(true); expect(f.page.fieldKey).toBe('power');
    expect(f.root.querySelector('.sheet-heading h2')?.textContent).toBe('添加展示');
    expect(f.root.querySelector('.new-field')).toBeNull();
    const radios = [...f.root.querySelectorAll('ion-radio')];
    expect(radios.length).toBeGreaterThan(0);
    expect(radios.map(radio => (radio as HTMLElement & { value?: string }).value)).not.toContain('__new__');
    expect(f.root.textContent).not.toContain('新字段…');
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it('lets a clean property sheet close through the bound backdrop guard without a confirmation', async () => {
    const f = render(), p = openProperties(f);
    expect(typeof p.modal.canDismiss).toBe('function');
    expect(await p.modal.dismiss()).toBe(true); f.fixture.detectChanges();
    expect(f.page.propertyCard).toBeUndefined(); expect(alerts.create).not.toHaveBeenCalled();
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it.each(['新属性草稿', '温'.repeat(22)])('protects unapplied valid or invalid input on system/backdrop dismissal: %s', async title => {
    const f = render(), p = openProperties(f); p.title(title);
    expect(p.body.hasUnappliedChanges).toBe(true); expect(f.page.dirty).toBe(false);
    alerts.create.mockResolvedValueOnce(dialog('cancel'));
    expect(await p.modal.dismiss('backdrop')).toBe(false); f.fixture.detectChanges();
    expect(p.input.value).toBe(title); expect(f.page.propertyCard).toBeDefined();
    expect(f.page.document).toEqual(f.document);
    expect(alerts.create.mock.calls[0][0].header).toBe('放弃未应用的属性？');
    alerts.create.mockResolvedValueOnce(dialog('destructive'));
    expect(await p.modal.dismiss('backdrop')).toBe(true); f.fixture.detectChanges();
    expect(f.page.propertyCard).toBeUndefined(); expect(f.page.dirty).toBe(false);
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it('does not prompt after property input is corrected back to its original value', async () => {
    const f = render(), p = openProperties(f); p.title('温'.repeat(22)); p.title('电源');
    expect(p.body.invalid).toBe(false); expect(p.body.hasUnappliedChanges).toBe(false);
    expect(await p.modal.dismiss()).toBe(true); expect(alerts.create).not.toHaveBeenCalled(); noRemoteWork();
  });

  it.each(['cancel', 'apply', 'remove'])('does not confirm again after an explicit property %s', async action => {
    const f = render(), p = openProperties(f); p.title('显式操作草稿');
    p.root.querySelector<HTMLButtonElement>(action === 'remove' ? '.remove-button' : `.${action}`)!.click();
    expect(f.page.propertyCard).toBeUndefined();
    expect(await f.page.canDismissProperty()).toBe(true); expect(alerts.create).not.toHaveBeenCalled();
    if (action === 'cancel') expect(f.page.document).toEqual(f.document);
    if (action === 'apply') expect(f.page.document!.widgets[0].title).toBe('显式操作草稿');
    if (action === 'remove') expect(f.page.document!.widgets).toEqual([]);
    noRemoteWork();
  });

  it('shares one pending confirmation and accepts fresh State without dropping the property input', async () => {
    const f = render(), p = openProperties(f); p.title('保留输入');
    let finish!: (value: { role: string }) => void;
    const prompt = dialog(); prompt.onDidDismiss.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    alerts.create.mockResolvedValue(prompt);
    const first = f.page.canDismissProperty(), repeated = f.page.canDismissProperty();
    expect(repeated).toBe(first); await Promise.resolve();
    f.fixture.componentRef.setInput('liveSnapshot', { ...f.page.liveSnapshot!, stateRevision: 4,
      endpoints: f.page.liveSnapshot!.endpoints.map(field => ({ ...field, value: true })) });
    f.fixture.detectChanges(); expect(p.input.value).toBe('保留输入');
    finish({ role: 'destructive' }); expect(await first).toBe(true);
    expect(alerts.create).toHaveBeenCalledOnce(); expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it('does not let an old confirmation dismiss a newly opened property session', async () => {
    const f = render(), p = openProperties(f); p.title('旧会话');
    let finish!: (value: { role: string }) => void;
    const prompt = dialog(); prompt.onDidDismiss.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    alerts.create.mockResolvedValue(prompt);
    const pending = f.page.canDismissProperty(); await Promise.resolve();
    await f.page.openWidget('power-control'); f.fixture.detectChanges();
    finish({ role: 'destructive' }); expect(await pending).toBe(false);
    expect(f.page.propertyCard).toBeDefined(); expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it('keeps the sheet and input when a discard confirmation cannot be opened', async () => {
    const f = render(), p = openProperties(f); p.title('打开确认失败仍保留');
    alerts.create.mockRejectedValueOnce(new Error('overlay unavailable'));
    expect(await p.modal.dismiss()).toBe(false);
    expect(p.input.value).toBe('打开确认失败仍保留'); expect(f.page.propertyCard).toBeDefined();
    expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it.each(['present', 'onDidDismiss'] as const)('cleans up its own confirmation after %s fails without losing input', async failure => {
    const f = render(), p = openProperties(f); p.title('异常后保留输入');
    const prompt = dialog(); prompt[failure].mockRejectedValueOnce(new Error('overlay failed'));
    prompt.dismiss.mockResolvedValueOnce(false); alerts.create.mockResolvedValue(prompt);
    expect(await p.modal.dismiss()).toBe(false);
    expect(prompt.dismiss).toHaveBeenCalledExactlyOnceWith(undefined, 'cancel'); expect(prompt.remove).toHaveBeenCalledOnce();
    expect(p.input.value).toBe('异常后保留输入'); expect(f.page.propertyCard).toBeDefined(); noRemoteWork();
  });

  it('does not stack a whole-page confirmation over a pending property confirmation', async () => {
    const f = render(), p = openProperties(f); p.title('保留当前决定');
    let finish!: (value: { role: string }) => void;
    const prompt = dialog(); prompt.onDidDismiss.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    alerts.create.mockResolvedValue(prompt);
    const pending = f.page.canDismissProperty();
    expect(await f.page.canDeactivate()).toBe(false);
    expect(alerts.create).toHaveBeenCalledOnce(); finish({ role: 'cancel' });
    expect(await pending).toBe(false); expect(f.page.propertyCard).toBeDefined(); noRemoteWork();
  });

  it('does not present a late confirmation after the editor is destroyed', async () => {
    const f = render(), p = openProperties(f); p.title('销毁前草稿');
    let created!: (value: ReturnType<typeof dialog>) => void;
    alerts.create.mockReturnValue(new Promise(resolve => { created = resolve; }));
    const pending = f.page.canDismissProperty(); f.fixture.destroy(); fixture = undefined;
    const prompt = dialog('destructive'); created(prompt);
    expect(await pending).toBe(false); expect(prompt.present).not.toHaveBeenCalled();
    expect(prompt.remove).toHaveBeenCalledOnce(); noRemoteWork();
  });

  it('cleans up an active property confirmation on destruction without accepting its result', async () => {
    const f = render(), p = openProperties(f); p.title('未应用');
    let finish!: (value: { role: string }) => void;
    const prompt = dialog(); prompt.onDidDismiss.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    prompt.dismiss.mockImplementation(async () => { finish({ role: 'cancel' }); return true; });
    alerts.create.mockResolvedValue(prompt);
    const pending = f.page.canDismissProperty(); await Promise.resolve(); await Promise.resolve();
    f.fixture.destroy(); fixture = undefined;
    expect(await pending).toBe(false); expect(prompt.dismiss).toHaveBeenCalledExactlyOnceWith(undefined, 'cancel'); noRemoteWork();
  });

  it('handles a cleanup rejection on destruction by removing only its own confirmation', async () => {
    const f = render(), p = openProperties(f); p.title('销毁时保留原文档');
    let finish!: (value: { role: string }) => void;
    const prompt = dialog(); prompt.onDidDismiss.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    prompt.dismiss.mockRejectedValueOnce(new Error('dismiss failed')); alerts.create.mockResolvedValue(prompt);
    const pending = f.page.canDismissProperty(); await Promise.resolve(); await Promise.resolve();
    f.fixture.destroy(); fixture = undefined; await Promise.resolve();
    finish({ role: 'cancel' }); expect(await pending).toBe(false);
    expect(prompt.remove).toHaveBeenCalledOnce(); expect(f.page.document).toEqual(f.document); noRemoteWork();
  });

  it.each([false, true])('uses one whole-page discard confirmation when unapplied properties exist and page dirty=%s', async dirty => {
    const f = render();
    if (dirty) f.page.updateWidget({ ...f.page.document!.widgets[0], title: '已应用的页面草稿' });
    f.fixture.detectChanges(); const p = openProperties(f); p.title('仅在属性内的草稿');
    const draft = structuredClone(f.page.document);
    alerts.create.mockResolvedValueOnce(dialog('cancel'));
    expect(await f.page.canDeactivate()).toBe(false); expect(p.input.value).toBe('仅在属性内的草稿');
    expect(alerts.create).toHaveBeenCalledOnce(); expect(alerts.create.mock.calls[0][0].header).toBe('放弃未保存的修改？');
    alerts.create.mockResolvedValueOnce(dialog('destructive'));
    expect(await f.page.canDeactivate()).toBe(true); expect(alerts.create).toHaveBeenCalledTimes(2);
    expect(f.page.document).toEqual(draft); noRemoteWork();
  });
});
