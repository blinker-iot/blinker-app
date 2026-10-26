import { SimpleChange } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import type { LegacyBinding } from '../../../core/device-v2/legacy-panel';
import type { PanelDocument } from '../../../core/device-v2/panel-document';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceConsole } from '../../../core/services/device-console.service';
import type { DevicePanelRecord } from '../../../core/services/device-panel.service';
import type { DeviceV2PageLayoutRecord } from '../../../core/services/device-v2-page-layout.service';
import type { EmbeddedPanelSession } from './embedded-panel-session';
import { PanelEditorPage } from './panel-editor.page';
import { PanelWidgetEditorContextService } from './panel-widget-editor-context.service';
import { InlineWidgetPropertiesComponent } from './inline-widget-properties';

// The real editor class, draft parser and save chain. All account/network/radio
// boundaries are local doubles; no saved user document or device is accessed.
describe('inline panel editor borrowed-session boundary', () => {
  const pages: PanelEditorPage[] = [];
  afterEach(() => { for (const page of pages.splice(0)) page.ngOnDestroy(); });

  function setup(hasRecord = true, options: { legacy?: boolean; preview?: boolean; anonymous?: boolean } = {}) {
    const id = 'inline-panel-device', fingerprint = 'ab'.repeat(32);
    const device = { id, deviceName: id, cloudEnabled: !options.legacy, config: { mode: options.legacy ? 'mqtt' : 'bbp2',
      component: options.legacy ? 'Layouter2Component' : 'DeviceV2', customName: '测试设备', panelMode: 'normal',
      canEditConsole: true, isPreview: options.preview ?? false },
      data: {}, storage: {}, subject: new Subject(),
    } as unknown as BlinkerDevice;
    const document: PanelDocument = { schemaVersion: 1, columns: 8, style: 'electronic', widgets: [
      { widgetId: 'parent-reading', type: 'value', variant: 'number', endpointKey: 'voltage', title: '电压',
        options: { decimals: 0, showDelta: false }, grid: { x: 4, y: 8, width: 2, height: 2 } },
      { widgetId: 'power-control', type: 'switch', endpointKey: 'power', title: '电源',
        grid: { x: 0, y: 0, width: 4, height: 2 } },
    ] };
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: fingerprint,
      manifestRevision: 2, stateRevision: 3, stateFresh: true, endpoints: [
        { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true, value: false },
        { id: 2, key: 'voltage', role: 'property', valueType: 'number', readable: true, writable: false, notifies: true, value: 0 },
      ] };
    const record: DeviceV2PageLayoutRecord | null = hasRecord ? { logicalDeviceId: id, revision: 7,
      manifestFingerprint: fingerprint, layout: { ...structuredClone(document), revision: 7, manifestFingerprint: fingerprint },
      createdAt: 1, updatedAt: 2 } : null;
    const bindings: Record<string, LegacyBinding> = Object.fromEntries(document.widgets.map(widget => [widget.widgetId,
      { field: snapshot.endpoints.find(field => field.key === widget.endpointKey)!, source: { type: widget.type === 'switch' ? 'btn' : 'num', mode: 1, key: widget.endpointKey } }]));
    const legacyRecord: DevicePanelRecord | null = hasRecord ? { panelId: 'inline-legacy', revision: 7,
      createdAt: 1, updatedAt: 2, panel: { device: { protocol: 'mqtt', source: 'test', key: id },
        document: structuredClone(document), bindings: structuredClone(bindings), view: 'normal' } } : null;
    const seed: EmbeddedPanelSession = { device, document, snapshot,
      record: options.legacy ? undefined : record, bindings: options.legacy ? bindings : undefined,
      legacyRecord: options.legacy ? legacyRecord : undefined };
    const data = { auth: options.anonymous ? null : { uuid: 'inline-account' },
      user: options.anonymous ? {} : { id: 'inline-account' }, sessionEpoch: 1,
      device: { dict: { [id]: device } }, userDataLoader: new BehaviorSubject(true) };
    const appActive = new BehaviorSubject(true);
    const port = { appActive, openConnection: vi.fn(), watchState: vi.fn(), watchConnection: vi.fn(), sendCommand: vi.fn() };
    const devices = { sendData: vi.fn(), saveDeviceConfig: vi.fn(async () => true), islocalDevice: vi.fn(() => false) };
    const layouts = { get: vi.fn(), saveCandidate: vi.fn() };
    const panels = { get: vi.fn(), save: vi.fn(), install: vi.fn() };
    const nav = { navigateForward: vi.fn(async () => true), navigateBack: vi.fn(async () => true) };
    let dismissal = 'destructive';
    const alerts = { create: vi.fn(async () => ({ present: vi.fn(async () => undefined),
      onDidDismiss: vi.fn(async () => ({ role: dismissal })) })) };
    const contexts = new PanelWidgetEditorContextService();
    const makeConsole = (candidate = record?.layout): DeviceConsole => ({ logicalDeviceId: id,
      name: '测试设备', deviceType: 'WiFi', revision: 101,
      layout: candidate ? { ...structuredClone(candidate), revision: hasRecord ? 8 : 1 } : null,
      uiConfig: { panelMode: 'normal' }, defaultMode: 'normal', availableModes: ['normal'],
      capabilities: { canRead: true, canCommand: true, commandEndpointKeys: null, canEditConsole: true, canManageSharing: true } });
    const consoles = { get: vi.fn(), save: vi.fn(async (_id: string, change: { layout?: DeviceV2PageLayoutRecord['layout'] }) => makeConsole(change.layout)) };
    const page = new PanelEditorPage({ snapshot: { paramMap: { get: () => id } } } as never,
      data as never, devices as never, port as never, layouts as never, nav as never,
      alerts as never, { showToast: vi.fn(async () => undefined) } as never,
      { theme: 'light' } as never, { markForCheck: vi.fn(), detectChanges: vi.fn() } as never,
      panels as never, contexts, consoles as never);
    page.embeddedSession = seed;
    page.hostRevision = record?.revision ?? 0;
    page.liveSnapshot = snapshot;
    page.ngOnInit();
    pages.push(page);
    const saved = vi.fn(); page.saved.subscribe(saved);
    const events = vi.fn(); device.subject.subscribe(events);
    const noPersistence = () => {
      expect(consoles.save).not.toHaveBeenCalled(); expect(layouts.saveCandidate).not.toHaveBeenCalled();
      expect(panels.save).not.toHaveBeenCalled(); expect(devices.saveDeviceConfig).not.toHaveBeenCalled();
    };
    const noOwnedConnection = () => {
      expect(port.openConnection).not.toHaveBeenCalled(); expect(port.watchState).not.toHaveBeenCalled();
      expect(port.watchConnection).not.toHaveBeenCalled(); expect(layouts.get).not.toHaveBeenCalled();
      expect(panels.get).not.toHaveBeenCalled(); expect(consoles.get).not.toHaveBeenCalled();
    };
    return { id, page, seed, document, record, legacyRecord, bindings, snapshot, device, data, appActive, port, devices, layouts,
      panels, consoles, contexts, nav, alerts, saved, events, makeConsole, noPersistence, noOwnedConnection,
      dismiss: (role: string) => { dismissal = role; } };
  }

  it('deep-clones the host seed once without loading, opening a connection or changing saved coordinates', () => {
    const f = setup();
    expect(f.page.embedded).toBe(true); expect(f.page.mode).toBe('layout');
    expect(f.page.loading).toBe(false); expect(f.page.dirty).toBe(false); expect(f.page.editingAllowed).toBe(true);
    expect(f.page.editBlockedReason).toBe('');
    expect(f.page.document).toEqual(f.document); expect(f.page.document).not.toBe(f.document);
    expect(f.page.document!.widgets[0].grid).not.toBe(f.document.widgets[0].grid);
    expect(f.page.items.map(widget => widget.widgetId)).toEqual(['power-control', 'parent-reading']);
    f.noOwnedConnection(); f.noPersistence();
  });

  it('adds a second display instance of an existing Manifest field without creating a capability or saving', () => {
    const f = setup(); f.page.openLibrary();
    const preset = f.page.catalogue.find(entry => entry.preset.type === 'switch')!;
    expect(preset).toBeDefined(); f.page.add(preset.id);
    expect(f.page.document!.widgets).toHaveLength(3);
    const added = f.page.document!.widgets[2];
    expect(added.endpointKey).toBe('power');
    expect(f.page.document!.widgets[1].endpointKey).toBe('power');
    expect(new Set(f.page.document!.widgets.map(widget => widget.widgetId)).size).toBe(3);
    expect(f.page.endpoints).toHaveLength(2); expect(f.document.widgets).toHaveLength(2);
    expect(f.page.dirty).toBe(true); f.noPersistence(); f.noOwnedConnection();
  });

  it.each([false, true])('cannot create a new binding in an embedded display catalogue, legacy=%s', legacy => {
    const f = setup(true, { legacy }); f.page.openLibrary(); const id = f.page.catalogue[0]!.id;
    f.page.fieldKey = '__new__'; f.page.newKey = 'invented-capability';
    expect(f.page.catalogue).toEqual([]); f.page.add(id);
    expect(f.page.document).toEqual(f.document); expect(f.page.dirty).toBe(false);
    f.page.fieldKey = 'not-in-manifest'; expect(f.page.catalogue).toEqual([]); f.page.add(id);
    expect(f.page.document).toEqual(f.document); f.noPersistence();
  });

  it('uses the existing sort commit for tap-to-move while retaining unapplied property inputs and current placement', async () => {
    const f = setup(); await f.page.openWidget('power-control');
    const properties = new InlineWidgetPropertiesComponent(); properties.card = f.page.propertyCard!;
    properties.updateWidget({ ...properties.widget!, title: '属性尚未应用' });
    f.page.moveProperty(1);
    expect(f.page.items.map(item => item.widgetId)).toEqual(['parent-reading', 'power-control']);
    const placed = f.page.document!.widgets.find(item => item.widgetId === 'power-control')!.grid;
    properties.card = f.page.propertyCard!;
    expect(properties.widget!.title).toBe('属性尚未应用');
    f.page.applyProperty(properties.widget!);
    expect(f.page.document!.widgets.find(item => item.widgetId === 'power-control')).toMatchObject({ title: '属性尚未应用', grid: placed });
    expect(f.document.widgets[1].grid).toEqual({ x: 0, y: 0, width: 4, height: 2 });
    f.noPersistence(); f.noOwnedConnection();
  });

  it('restores the transient drag preview on background without committing or losing a parent draft', () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '保留草稿' });
    const document = f.page.document, order = f.page.items.map(item => item.widgetId);
    f.page.startDrag(); f.page.moveDrag({ from: order[0], to: order[1] });
    expect(f.page.items.map(item => item.widgetId)).not.toEqual(order);
    f.appActive.next(false);
    expect(f.page.items.map(item => item.widgetId)).toEqual(order);
    expect(f.page.document).toBe(document); expect(f.page.dirty).toBe(true);
    f.appActive.next(true); expect(f.page.editingAllowed).toBe(true); f.noPersistence(); f.noOwnedConnection();
  });

  it('applies property edits only to the whole-panel draft and keeps unrelated edits plus undo', async () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '父画布未保存名称' });
    await f.page.openWidget('power-control');
    expect(f.page.propertyCard?.widget.widgetId).toBe('power-control');
    f.page.applyProperty({ ...f.page.propertyCard!.widget, title: '属性应用名称' });
    expect(f.page.propertyCard).toBeUndefined(); expect(f.page.dirty).toBe(true);
    expect(f.page.document!.widgets[0].title).toBe('父画布未保存名称');
    expect(f.page.document!.widgets[1].title).toBe('属性应用名称');
    expect(f.document.widgets[1].title).toBe('电源');
    f.page.undo(); expect(f.page.document!.widgets[1].title).toBe('电源');
    expect(f.page.document!.widgets[0].title).toBe('父画布未保存名称');
    expect(f.page.canUndo).toBe(true); expect(f.contexts.get(f.id, 'power-control')).toBeUndefined();
    expect(f.nav.navigateForward).not.toHaveBeenCalled(); f.noPersistence();
  });

  it('removes only the selected widget draft and allows undo without deleting a field or persisting', async () => {
    const f = setup(); await f.page.openWidget('power-control'); f.page.removeProperty();
    expect(f.page.document!.widgets.map(widget => widget.widgetId)).toEqual(['parent-reading']);
    expect(f.page.endpoints.some(field => field.key === 'power')).toBe(true);
    expect(f.page.propertyCard).toBeUndefined(); f.page.undo();
    expect(f.page.document!.widgets).toEqual(f.document.widgets); f.noPersistence();
  });

  it('ignores an unrelated property identity and retains the open property draft', async () => {
    const f = setup(); await f.page.openWidget('power-control'); const card = f.page.propertyCard;
    f.page.applyProperty({ ...card!.widget, widgetId: 'foreign-widget', title: '不能应用' });
    expect(f.page.propertyCard).toBe(card); expect(f.page.document).toEqual(f.document); f.noPersistence();
  });

  it('updates live State cards without resetting the draft, seed, undo or loaded layout revision', () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '保留父草稿' });
    const document = f.page.document;
    const live = { ...f.snapshot, stateRevision: 4, endpoints: f.snapshot.endpoints.map(field => ({ ...field, value: field.key === 'power' ? true : 25 })) };
    f.page.liveSnapshot = live; f.page.ngOnChanges({ liveSnapshot: new SimpleChange(f.snapshot, live, false) });
    expect(f.page.document).toBe(document); expect(f.page.document!.widgets[0].title).toBe('保留父草稿');
    expect(f.page.cards.get('power-control')?.value).toBe(true); expect(f.page.canUndo).toBe(true);
    expect(f.page.editingAllowed).toBe(true); expect(f.seed.document).toEqual(f.document); f.noOwnedConnection();
  });

  it('never sends a device command or enables real-control preview in an embedded session', () => {
    const f = setup(); f.page.setMode('preview'); expect(f.page.mode).toBe('layout');
    const card = f.page.cards.get('power-control')!;
    f.page.previewAction(card, { kind: 'toggle', value: true });
    f.page.previewAction(card, { kind: 'draft', value: 'false' });
    expect(f.port.sendCommand).not.toHaveBeenCalled(); expect(f.devices.sendData).not.toHaveBeenCalled();
    f.noPersistence(); f.noOwnedConnection();
  });

  it('saves the entire current draft once with layout revision 7, without navigation or component-remount events', async () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '父画布修改' });
    await f.page.openWidget('power-control'); f.page.applyProperty({ ...f.page.propertyCard!.widget, title: '属性修改' });
    const draft = structuredClone(f.page.document);
    expect(await f.page.save(false)).toBe(true);
    expect(f.consoles.save).toHaveBeenCalledExactlyOnceWith(f.id, { layout: { ...draft, revision: 7,
      manifestFingerprint: f.snapshot.manifestFingerprint }, uiConfig: { panelMode: 'normal' } });
    expect(f.saved).toHaveBeenCalledOnce(); expect(f.saved.mock.calls[0][0]).toMatchObject({ record: { revision: 8 }, consoleRevision: 101 });
    expect(f.events).not.toHaveBeenCalled(); expect(f.nav.navigateBack).not.toHaveBeenCalled();
    expect(f.page.dirty).toBe(false); f.noOwnedConnection();
  });

  it('preserves absent-layout CAS zero even when the displayed automatic document has a generated revision', async () => {
    const f = setup(false); f.page.updateWidget({ ...f.page.document!.widgets[1], title: '新布局草稿' });
    expect(f.page.hostRevision).toBe(0); expect(await f.page.save(false)).toBe(true);
    expect(f.consoles.save.mock.calls[0][1].layout?.revision).toBe(1);
    expect(f.saved.mock.calls[0][0]).toMatchObject({ record: { revision: 1 } });
    f.noOwnedConnection();
  });

  it.each([false, true])('passes the exact legacy PageLayout CAS token when the borrowed record exists=%s', async hasRecord => {
    const f = setup(hasRecord); f.device.cloudEnabled = false;
    const expectedRevision = hasRecord ? 7 : 0;
    f.layouts.saveCandidate.mockResolvedValueOnce({ logicalDeviceId: f.id, revision: expectedRevision + 1,
      manifestFingerprint: f.snapshot.manifestFingerprint, createdAt: 1, updatedAt: 2,
      layout: { ...structuredClone(f.document), revision: expectedRevision + 1, manifestFingerprint: f.snapshot.manifestFingerprint } });
    expect(await f.page.save(false)).toBe(true);
    expect(f.layouts.saveCandidate).toHaveBeenCalledExactlyOnceWith(f.id,
      { ...f.document, revision: Math.max(1, expectedRevision), manifestFingerprint: f.snapshot.manifestFingerprint },
      f.snapshot.endpoints, expectedRevision);
    expect(f.consoles.save).not.toHaveBeenCalled(); f.noOwnedConnection();
  });

  it('retains the exact whole-panel draft and undo on save failure, with no automatic retry or saved event', async () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '失败保留' });
    const document = f.page.document; f.consoles.save.mockRejectedValueOnce({ code: 'DEVICE_V2_PAGE_LAYOUT_CONFLICT' });
    expect(await f.page.save(false)).toBe(false); expect(f.page.document).toBe(document);
    expect(f.page.dirty).toBe(true); expect(f.page.canUndo).toBe(true);
    expect(f.consoles.save).toHaveBeenCalledOnce(); expect(f.saved).not.toHaveBeenCalled();
    expect(f.page.error).toContain('草稿已保留'); expect(f.events).not.toHaveBeenCalled();
  });

  it.each(['account', 'session', 'device', 'permission', 'shared-permission', 'manifest', 'revision', 'hidden', 'mode'] as const)('explains and rejects the old %s scope without changing the draft or saving', async reason => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '有效期内的草稿' });
    await f.page.openWidget('power-control'); const document = f.page.document;
    const original = structuredClone(document), propertyCard = f.page.propertyCard;
    expect(f.page.editBlockedReason).toBe('');
    if (reason === 'account') { f.data.auth!.uuid = 'another-account'; f.data.sessionEpoch++; }
    if (reason === 'session') f.data.sessionEpoch++;
    if (reason === 'device') f.data.device.dict[f.id] = { ...f.device, config: { ...f.device.config } } as BlinkerDevice;
    if (reason === 'permission') f.device.config.canEditConsole = false;
    if (reason === 'shared-permission') { f.device.config.isShared = true; f.device.config.canEditConsole = false; }
    if (reason === 'revision') f.page.hostRevision = 8;
    if (reason === 'hidden') f.device.config.hiddenEndpointKeys = ['power'];
    if (reason === 'mode') f.device.config.panelMode = 'custom';
    if (reason === 'manifest') {
      f.page.liveSnapshot = { ...f.snapshot, manifestFingerprint: 'cd'.repeat(32) };
      f.page.ngOnChanges({ liveSnapshot: new SimpleChange(f.snapshot, f.page.liveSnapshot, false) });
    }
    expect(f.page.editingAllowed).toBe(false);
    expect(f.page.editBlockedReason).toContain('草稿');
    expect(f.page.editBlockedReason).toContain('保留');
    expect(f.page.editBlockedReason).toContain('×');
    expect(f.page.editBlockedReason).toContain('取消');
    expect(f.page.error).toBe(''); // Feedback is derived before a disabled Save can be clicked.
    f.page.applyProperty({ ...f.page.propertyCard!.widget, title: '失效后不能应用' });
    expect(f.page.document).toBe(document); expect(await f.page.save(false)).toBe(false);
    expect(f.page.document).toBe(document); expect(f.page.document).toEqual(original);
    expect(f.page.propertyCard?.widget).toBe(propertyCard?.widget); expect(f.page.dirty).toBe(true);
    expect(f.seed.document).toEqual(f.document); f.noPersistence(); f.noOwnedConnection();
  });

  it('explains a changed service authority without discarding the draft, reading or writing either service', async () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '切换服务前草稿' });
    await f.page.openWidget('power-control');
    const document = f.page.document, original = structuredClone(document);
    const authority = vi.spyOn(API, 'BASE_URL', 'get').mockReturnValue('https://inline-other-service.invalid');
    try {
      expect(f.page.editBlockedReason).toContain('草稿');
      expect(f.page.editBlockedReason).toContain('保留');
      expect(f.page.editBlockedReason).toContain('×');
      expect(f.page.editBlockedReason).toContain('取消');
      expect(f.page.editingAllowed).toBe(false);
      f.page.applyProperty({ ...f.page.propertyCard!.widget, title: '不能跨服务应用' });
      expect(await f.page.save(false)).toBe(false);
      expect(f.page.document).toBe(document); expect(f.page.document).toEqual(original);
      expect(f.page.dirty).toBe(true); f.noPersistence(); f.noOwnedConnection();
    } finally { authority.mockRestore(); }
    expect(f.page.editBlockedReason).toBe(''); expect(f.page.editingAllowed).toBe(true);
  });

  it('fences late cloud save results after an account change without emitting saved or installing old config', async () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '待确认草稿' });
    const document = f.page.document; let finish!: (source: DeviceConsole) => void;
    f.consoles.save.mockReturnValueOnce(new Promise<DeviceConsole>(resolve => { finish = resolve; }));
    const pending = f.page.save(false); expect(f.page.saving).toBe(true);
    f.data.sessionEpoch++; const source = f.makeConsole(); source.uiConfig.hiddenEndpointKeys = ['power'];
    finish(source); expect(await pending).toBe(false);
    expect(f.page.document).toBe(document); expect(f.page.dirty).toBe(true);
    expect(f.device.config.hiddenEndpointKeys).toBeUndefined(); expect(f.saved).not.toHaveBeenCalled();
  });

  it('suspends draft interaction in background or inactive route without opening another connection or losing edits', () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[0], title: '后台保留' });
    const document = f.page.document; f.page.startDrag(); expect(f.page.dragOriginActive).toBe(true);
    f.appActive.next(false); expect(f.page.editingAllowed).toBe(false); expect(f.page.dragOriginActive).toBe(false);
    expect(f.page.editBlockedReason).toBe('');
    f.appActive.next(true); expect(f.page.editingAllowed).toBe(true);
    expect(f.page.editBlockedReason).toBe('');
    f.page.editingActive = false; f.page.ngOnChanges({ editingActive: new SimpleChange(true, false, false) });
    expect(f.page.editingAllowed).toBe(false); expect(f.page.editBlockedReason).toBe('');
    expect(f.page.document).toBe(document);
    f.page.editingActive = true; f.page.ngOnChanges({ editingActive: new SimpleChange(false, true, false) });
    expect(f.page.editBlockedReason).toBe(''); expect(f.page.editingAllowed).toBe(true);
    f.noOwnedConnection(); f.noPersistence();
  });

  it('uses the original discard confirmation and never persists on cancel/continue-editing decisions', async () => {
    const f = setup(); f.page.updateWidget({ ...f.page.document!.widgets[1], title: '未保存的面板' });
    f.dismiss('cancel'); expect(await f.page.canDeactivate()).toBe(false); expect(f.page.dirty).toBe(true);
    f.dismiss('destructive'); expect(await f.page.canDeactivate()).toBe(true);
    expect(f.document.widgets[1].title).toBe('电源'); f.noPersistence();
  });

  it('preserves raw property input and invalid state when fresh State only updates its readonly preview', () => {
    const f = setup(), properties = new InlineWidgetPropertiesComponent();
    const card = f.page.cards.get('power-control')!; properties.card = card;
    properties.updateWidget({ ...properties.widget!, title: '尚未应用的属性草稿' }); properties.invalid = true;
    const widget = properties.widget, version = properties.draftVersion, applied = vi.fn(); properties.applied.subscribe(applied);
    properties.card = { ...card, value: true, display: 'true' };
    expect(properties.widget).toBe(widget); expect(properties.draftVersion).toBe(version); expect(properties.invalid).toBe(true);
    expect(properties.previewCard?.value).toBe(true); properties.apply(); expect(applied).not.toHaveBeenCalled();
    properties.invalid = false; properties.apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith(widget); expect(applied.mock.calls[0][0]).not.toBe(widget);
    expect(f.page.document!.widgets[1].title).toBe('电源'); f.noPersistence(); f.noOwnedConnection();
  });

  it('borrows legacy bindings and revision, refreshes reading values without reloading, and saves once through the old panel owner', async () => {
    const f = setup(true, { legacy: true }); expect(f.page.editingAllowed).toBe(true);
    f.page.updateWidget({ ...f.page.document!.widgets[0], title: '旧设备父草稿' });
    const document = f.page.document; f.device.data.power = true; f.device.subject.next({ key: 'power', value: true });
    expect(f.page.cards.get('power-control')?.value).toBe(true); expect(f.page.document).toBe(document);
    expect(f.page.canUndo).toBe(true);
    f.panels.save.mockResolvedValueOnce({ ...f.legacyRecord!, revision: 8, panel: { ...f.legacyRecord!.panel, document } });
    expect(await f.page.save(false)).toBe(true);
    expect(f.panels.save).toHaveBeenCalledExactlyOnceWith(f.device, document, f.bindings, 7);
    expect(f.saved.mock.calls[0][0]).toMatchObject({ legacyRecord: { revision: 8 } });
    expect(f.consoles.save).not.toHaveBeenCalled(); expect(f.layouts.saveCandidate).not.toHaveBeenCalled();
    expect(f.devices.sendData).not.toHaveBeenCalled(); f.noOwnedConnection();
  });

  it('allows only the existing local legacy preview to edit anonymously without a remote layout save or device command', async () => {
    const f = setup(true, { legacy: true, preview: true, anonymous: true });
    expect(f.page.editingAllowed).toBe(true); expect(f.page.document).toEqual(f.document);
    f.page.updateWidget({ ...f.page.document!.widgets[1], title: '本机预览草稿' });
    f.panels.save.mockResolvedValueOnce({ ...f.legacyRecord!, revision: 8, panel: { ...f.legacyRecord!.panel, document: f.page.document! } });
    expect(await f.page.save(false)).toBe(true);
    expect(f.panels.save.mock.calls[0][0].config.isPreview).toBe(true);
    expect(f.consoles.save).not.toHaveBeenCalled(); expect(f.layouts.saveCandidate).not.toHaveBeenCalled();
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled(); expect(f.port.sendCommand).not.toHaveBeenCalled();
    expect(f.devices.sendData).not.toHaveBeenCalled(); f.noOwnedConnection();
  });
});
