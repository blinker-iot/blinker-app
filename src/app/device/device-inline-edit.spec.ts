import { NavigationCancel, NavigationError, NavigationStart } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import type { DeviceUiConnection, DeviceUiSnapshot } from '../core/device-v2/device-ui.port';
import type { LegacyBinding, LegacyPanel } from '../core/device-v2/legacy-panel';
import type { BlinkerDevice } from '../core/model/device.model';
import type { DevicePanelRecord } from '../core/services/device-panel.service';
import type { DeviceV2PageLayoutRecord } from '../core/services/device-v2-page-layout.service';
import type { PanelEditorPage } from '../sections/device/panel-editor/panel-editor.page';
import { DevicePage } from './device.page';
import { LegacyPanelComponent } from './legacy-panel/legacy-panel.component';
import { DeviceV2Page } from './v2/device-v2.page';

interface V2SeedOwner {
  logicalDeviceId: string;
  panelLayoutReady: boolean;
  storedLayout?: DeviceV2PageLayoutRecord;
  connection?: DeviceUiConnection;
  synchronized: boolean;
  pageVisible: boolean;
  applyStoredLayout(record: DeviceV2PageLayoutRecord | undefined, snapshot: DeviceUiSnapshot): void;
}

// Host and child production classes, with an inert dynamic view/radio boundary.
// No Angular/native lifecycle, real account, service, iframe or device is loaded.
describe('device detail inline editing ownership', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { for (const release of cleanup.splice(0).reverse()) release(); vi.useRealTimers(); });

  function v2Harness() {
    const id = 'inline-host-device';
    const device = { id, deviceName: id, cloudEnabled: true,
      config: { mode: 'bbp2', component: 'DeviceV2', panelMode: 'normal', customName: '测试设备', canEditConsole: true },
      data: {}, storage: {}, subject: new Subject(),
    } as unknown as BlinkerDevice;
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: 'ab'.repeat(32),
      manifestRevision: 1, stateRevision: 1, stateFresh: true, endpoints: [
        { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true, value: false },
      ] };
    const record: DeviceV2PageLayoutRecord = { logicalDeviceId: id, revision: 7, createdAt: 1, updatedAt: 2,
      manifestFingerprint: snapshot.manifestFingerprint!, layout: { schemaVersion: 1, columns: 8, revision: 7,
        manifestFingerprint: snapshot.manifestFingerprint!, style: 'natural', widgets: [
          { widgetId: 'power-instance', endpointKey: 'power', type: 'switch', grid: { x: 0, y: 0, width: 4, height: 2 } },
        ] } };
    const port = { openConnection: vi.fn(), sendCommand: vi.fn() };
    const host = { sessionVersion: 1, authenticated: true };
    const page = new DeviceV2Page(port as never, {} as never, {} as never, host as never,
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as never);
    page.device = device; page.snapshot = snapshot;
    const owner = page as unknown as V2SeedOwner;
    owner.logicalDeviceId = id;
    owner.applyStoredLayout(record, snapshot);
    owner.pageVisible = true;
    const close = vi.fn(), controller = new AbortController();
    const connection = { signal: controller.signal, ready: Promise.resolve(),
      closed: new Promise(() => undefined), close } as unknown as DeviceUiConnection;
    owner.connection = connection;
    cleanup.push(() => page.ngOnDestroy());
    return { id, page, owner, device, snapshot, record, port, connection, close };
  }

  function shellHarness() {
    const f = v2Harness(), events = new Subject();
    const router = { url: `/device/${f.id}`, events, navigate: vi.fn(async () => true) };
    const service = { connectDevice: vi.fn(), disconnectDevice: vi.fn(), queryDevice: vi.fn() };
    const data = { device: { dict: { [f.id]: f.device } }, deviceDataLoader: new BehaviorSubject(false) };
    const editor = { document: f.page.layout, saving: false, editingAllowed: true,
      canDeactivate: vi.fn(async () => true), save: vi.fn(async (_returnToDevice?: boolean) => {
        f.page.acceptPanelEdit({ record: { ...f.record, revision: 8, layout: { ...f.record.layout, revision: 8 } }, consoleRevision: 101 });
        return true;
      }) };
    f.page.panelEditor = editor as unknown as PanelEditorPage;
    const ref = { instance: f.page, setInput: vi.fn((name: string, value: unknown) => {
      if (name === 'device') f.page.device = value as BlinkerDevice;
      if (name === 'viewActive') f.page.viewActive = value as boolean;
    }), changeDetectorRef: { detectChanges: vi.fn() }, destroy: vi.fn() };
    const view = { clear: vi.fn(), createComponent: vi.fn(() => ref) };
    const modal = { present: vi.fn(async () => undefined), remove: vi.fn() };
    const modals = { create: vi.fn(async () => modal) };
    const shell = new DevicePage({ snapshot: { queryParamMap: { get: () => null } },
      paramMap: new BehaviorSubject({ get: () => f.id }) } as never,
      router as never, service as never, data as never, { devicePageIsRoot: false, theme: 'light' } as never,
      { init: vi.fn(), end: vi.fn() } as never, modals as never,
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as never,
      { showToast: vi.fn(async () => undefined) } as never, { get: vi.fn(async () => null) } as never);
    shell.ngOnInit(); shell.deviceView = view as never;
    cleanup.push(() => shell.ngOnDestroy());
    return { ...f, shell, editor, view, ref, router, events, service, modal, modals };
  }

  it('enters and cancels V2 editing with the same host connection and the current persisted revision', () => {
    const f = v2Harness(), before = structuredClone(f.page.layout);
    expect(f.page.beginPanelEdit()).toBe(true);
    expect(f.page.panelEditSession).toMatchObject({ device: f.device, document: before, record: { revision: 7 } });
    expect(f.page.panelRevision).toBe(7); expect(f.owner.connection).toBe(f.connection);
    expect(f.port.openConnection).not.toHaveBeenCalled(); expect(f.close).not.toHaveBeenCalled();
    f.page.endPanelEdit();
    expect(f.page.panelEditSession).toBeUndefined(); expect(f.page.layout).toEqual(before);
    expect(f.owner.connection).toBe(f.connection); expect(f.port.openConnection).not.toHaveBeenCalled();
  });

  it('accepts the confirmed record into the existing V2 object without a component event or connection replacement', () => {
    const f = v2Harness(), events = vi.fn(); f.device.subject.subscribe(events);
    expect(f.page.beginPanelEdit()).toBe(true);
    f.page.acceptPanelEdit({ record: { ...f.record, revision: 8, layout: { ...f.record.layout, revision: 8,
      widgets: [{ ...f.record.layout.widgets[0], title: '确认的新标题' }] } }, consoleRevision: 101 });
    expect(f.page.layout?.revision).toBe(8); expect(f.page.layout?.widgets[0].title).toBe('确认的新标题');
    expect(f.page.panelEditSession).toBeUndefined(); expect(f.owner.connection).toBe(f.connection);
    expect(f.port.openConnection).not.toHaveBeenCalled(); expect(events).not.toHaveBeenCalled();
  });

  it('does not begin a zero-revision edit until layout absence has actually been confirmed', () => {
    const f = v2Harness(); f.owner.storedLayout = undefined; f.owner.panelLayoutReady = false;
    expect(f.page.beginPanelEdit()).toBe(false);
    f.owner.panelLayoutReady = true; expect(f.page.beginPanelEdit()).toBe(true);
    expect(f.page.panelEditSession?.record).toBeNull(); expect(f.page.panelRevision).toBe(0);
  });

  it.each(['custom', 'permission', 'pending', 'manifest', 'stale'] as const)('keeps the %s V2 state out of component editing', reason => {
    const f = v2Harness();
    if (reason === 'custom') f.device.config.panelMode = 'custom';
    if (reason === 'permission') f.device.config.canEditConsole = false;
    if (reason === 'pending') f.page.pending.add('power');
    if (reason === 'manifest') f.page.snapshot = { ...f.snapshot, manifestAccepted: false };
    if (reason === 'stale') f.page.layoutStale = { removedWidgetIds: [], incompatibleWidgetIds: [], addedEndpointKeys: [] };
    expect(f.page.beginPanelEdit()).toBe(false); expect(f.page.panelEditSession).toBeUndefined();
    expect(f.port.openConnection).not.toHaveBeenCalled();
  });

  it('blocks both rendered panel actions and direct V2 send while an edit session is active', async () => {
    const f = v2Harness(); f.owner.synchronized = true; f.owner.pageVisible = true; f.page.accountState = 'ready';
    expect(f.page.beginPanelEdit()).toBe(true);
    f.page.onPanelAction({ kind: 'toggle', value: true, widgetId: 'power-instance', field: f.snapshot.endpoints[0] });
    await f.page.send(f.snapshot.endpoints[0], true);
    expect(f.port.sendCommand).not.toHaveBeenCalled(); expect(f.port.openConnection).not.toHaveBeenCalled();
  });

  it('keeps header edit/save in the current shell and does not clear/recreate its dynamic child', async () => {
    const f = shellHarness(); expect(f.view.createComponent).toHaveBeenCalledOnce();
    await f.shell.beginPanelEdit(); expect(f.shell.panelEditing).toBe(true);
    await f.shell.savePanelEdit();
    expect(f.editor.save).toHaveBeenCalledExactlyOnceWith(false);
    expect(f.shell.panelEditing).toBe(false); expect(f.page.layout?.revision).toBe(8);
    expect(f.view.createComponent).toHaveBeenCalledOnce(); expect(f.view.clear).toHaveBeenCalledOnce();
    expect(f.router.navigate).not.toHaveBeenCalled(); expect(f.service.connectDevice).not.toHaveBeenCalled();
    expect(f.port.openConnection).not.toHaveBeenCalled();
  });

  it('only discards a shell session after the original editor confirms, with no save or rebuild', async () => {
    const f = shellHarness(); await f.shell.beginPanelEdit(); const baseline = structuredClone(f.page.layout);
    f.editor.canDeactivate.mockResolvedValueOnce(false); await f.shell.cancelPanelEdit();
    expect(f.shell.panelEditing).toBe(true);
    await f.shell.cancelPanelEdit(); expect(f.shell.panelEditing).toBe(false);
    expect(f.page.layout).toEqual(baseline); expect(f.editor.save).not.toHaveBeenCalled();
    expect(f.view.createComponent).toHaveBeenCalledOnce();
  });

  it('delegates route exits to the current draft owner and retains it when the guard declines', async () => {
    const f = shellHarness(); await f.shell.beginPanelEdit();
    f.editor.canDeactivate.mockResolvedValueOnce(false);
    expect(await f.shell.canDeactivate()).toBe(false); expect(f.shell.panelEditing).toBe(true);
    expect(await f.shell.canDeactivate()).toBe(true); expect(f.shell.panelEditing).toBe(false);
    expect(f.editor.save).not.toHaveBeenCalled(); expect(f.view.createComponent).toHaveBeenCalledOnce();
  });

  it.each(['cancel', 'error'] as const)('restores viewActive after navigation %s without recreating the editing child', async outcome => {
    const f = shellHarness(); await f.shell.beginPanelEdit();
    f.events.next(new NavigationStart(2, '/home/device')); expect(f.shell.viewActive).toBe(false);
    f.events.next(outcome === 'cancel' ? new NavigationCancel(2, '/home/device', 'guard declined')
      : new NavigationError(2, '/home/device', new Error('navigation failed')));
    expect(f.shell.viewActive).toBe(true); expect(f.page.viewActive).toBe(true);
    expect(f.shell.panelEditing).toBe(true); expect(f.view.createComponent).toHaveBeenCalledOnce();
  });

  it('preserves the custom Agent editor route and document instead of seeding a component session', async () => {
    const f = shellHarness(); f.device.config.panelMode = 'custom';
    const customPanel = { html: '<main>原独立面板</main>', theme: 'natural' };
    f.device.config.customPanel = customPanel as never;
    await f.shell.beginPanelEdit();
    expect(f.router.navigate).toHaveBeenCalledExactlyOnceWith(['/device', f.id, 'edit', 'custom']);
    expect(f.page.panelEditSession).toBeUndefined(); expect(f.device.config.customPanel).toBe(customPanel);
    expect(f.view.createComponent).toHaveBeenCalledOnce(); expect(f.port.openConnection).not.toHaveBeenCalled();
  });

  it('keeps legacy external component-change events able to refresh a cached child', () => {
    const f = shellHarness();
    f.device.subject.next({ key: 'component', value: 'DeviceV2', source: 'component-settings' });
    expect(f.view.createComponent).toHaveBeenCalledTimes(2);
  });

  it('clears an old debug tap sequence on entering edit and ignores further debug taps during the session', async () => {
    vi.useFakeTimers(); const f = shellHarness();
    for (let i = 0; i < 4; i++) f.shell.enterDebug();
    await f.shell.beginPanelEdit();
    for (let i = 0; i < 5; i++) f.shell.enterDebug();
    await Promise.resolve(); expect(f.modals.create).not.toHaveBeenCalled();
    await f.shell.cancelPanelEdit(); f.shell.enterDebug();
    await Promise.resolve(); expect(f.modals.create).not.toHaveBeenCalled();
  });

  it('removes a delayed debug modal rather than presenting it over a new editing session', async () => {
    vi.useFakeTimers(); const f = shellHarness(); let finish!: (modal: typeof f.modal) => void;
    f.modals.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    for (let i = 0; i < 5; i++) f.shell.enterDebug();
    expect(f.modals.create).toHaveBeenCalledOnce(); await f.shell.beginPanelEdit();
    finish(f.modal); await Promise.resolve(); await Promise.resolve();
    expect(f.modal.present).not.toHaveBeenCalled(); expect(f.modal.remove).toHaveBeenCalledOnce();
    expect(f.shell.panelEditing).toBe(true); expect(f.view.createComponent).toHaveBeenCalledOnce();
  });

  it('seeds old ordinary panels with their saved CAS record/bindings and blocks control actions during editing', () => {
    const id = 'legacy-inline-device';
    const binding: LegacyBinding = { field: { id: 1, key: 'power', role: 'property', valueType: 'boolean',
      readable: true, writable: true, notifies: false }, source: { type: 'btn', mode: 1, key: 'power' } };
    const panel: LegacyPanel = { document: { schemaVersion: 1, columns: 8, widgets: [
      { widgetId: 'legacy-power', endpointKey: 'power', type: 'switch', grid: { x: 0, y: 0, width: 4, height: 2 } },
    ] }, bindings: { 'legacy-power': binding }, omitted: 0 };
    const device = { id, deviceName: id, config: { mode: 'mqtt', panelMode: 'normal' }, data: { enable: true },
      subject: new Subject() } as unknown as BlinkerDevice;
    const record: DevicePanelRecord = { panelId: 'legacy-panel', revision: 7, createdAt: 1, updatedAt: 2,
      panel: { device: { protocol: 'mqtt', source: 'test', key: id }, document: panel.document,
        bindings: panel.bindings, view: 'normal' } };
    const devices = { sendData: vi.fn(), islocalDevice: vi.fn(() => false) }, panels = { get: vi.fn(), install: vi.fn() };
    const page = new LegacyPanelComponent(devices as never, panels as never); page.device = device; page.panel = panel;
    cleanup.push(() => page.ngOnDestroy());
    expect(page.beginPanelEdit()).toBe(false); // undefined record is not confirmed absence.
    page.panelRecord = record; expect(page.beginPanelEdit()).toBe(true);
    expect(page.panelEditSession).toMatchObject({ document: panel.document, bindings: panel.bindings, legacyRecord: { revision: 7 } });
    page.act({ kind: 'toggle', widgetId: 'legacy-power', value: true, field: binding.field }); expect(devices.sendData).not.toHaveBeenCalled();
    page.endPanelEdit(); expect(page.panel.document).toEqual(panel.document); expect(panels.get).not.toHaveBeenCalled();
    device.config.panelMode = 'custom'; expect(page.beginPanelEdit()).toBe(false);
  });
});
