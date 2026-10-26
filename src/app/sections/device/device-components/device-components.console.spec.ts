import { BehaviorSubject, Subject } from 'rxjs';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import type { PageLayout } from '../../../core/device-v2/page-layout';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceConsole } from '../../../core/services/device-console.service';
import type { DeviceV2PageLayoutRecord } from '../../../core/services/device-v2-page-layout.service';
import { DeviceComponentsPage } from './device-components.page';

// Production methods and real layout validation; network, account, radio and
// persistence are local doubles. No account, device or saved layout is loaded.
describe('component settings Console/legacy routing', () => {
  const pages: DeviceComponentsPage[] = [];
  afterEach(() => { for (const page of pages.splice(0)) page.ngOnDestroy(); });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(finish => { resolve = finish; });
    return { promise, resolve };
  }

  function setup(options: { cloud?: boolean; preview?: boolean; shared?: boolean } = {}) {
    const id = 'component-settings-device', fingerprint = 'ab'.repeat(32);
    const layout: PageLayout = { schemaVersion: 1, columns: 8, revision: 7,
      manifestFingerprint: fingerprint, style: 'dark', widgets: [
        { widgetId: 'saved-voltage', type: 'value', variant: 'number', endpointKey: 'voltage', title: '电压',
          grid: { x: 4, y: 4, width: 2, height: 2 }, options: { decimals: 0, showDelta: false } },
        { widgetId: 'saved-temperature', type: 'value', variant: 'number', endpointKey: 'temperature', title: '温度',
          grid: { x: 2, y: 4, width: 2, height: 2 }, options: { scale: 0.1 } },
      ] };
    let stored: DeviceConsole = { logicalDeviceId: id, name: '测试设备', deviceType: 'WiFi', revision: 101,
      layout: structuredClone(layout), uiConfig: { panelMode: 'normal', hiddenEndpointKeys: [] },
      defaultMode: 'normal', availableModes: ['normal'], capabilities: { canRead: true, canCommand: true,
        commandEndpointKeys: null, canEditConsole: true, canManageSharing: true } };
    const device = { id, deviceName: id, cloudEnabled: options.cloud ?? true,
      config: { mode: 'bbp2', isShared: options.shared ?? false, isPreview: options.preview ?? false,
        customName: '测试设备', hiddenEndpointKeys: [] }, data: {}, subject: new Subject(),
    } as unknown as BlinkerDevice;
    const snapshot: DeviceUiSnapshot = { manifestAccepted: true, manifestFingerprint: fingerprint,
      manifestRevision: 1, stateRevision: 2, stateFresh: true,
      endpoints: ['voltage', 'temperature'].map((key, i) => ({ id: i + 1, key, role: 'property',
        valueType: 'number', readable: true, writable: false, notifies: true, value: 20 + i })) };
    const state = new BehaviorSubject(snapshot), close = vi.fn();
    const port = { watchState: vi.fn(() => state), openConnection: vi.fn(() => ({ ready: Promise.resolve(), close })) };
    const data = { auth: { uuid: 'test-account' }, sessionEpoch: 1, getDevice: vi.fn(() => device),
      deviceDataLoader: new BehaviorSubject(true) };
    const devices = { loadDeviceConfig: vi.fn(async () => ({ hiddenEndpointKeys: [] as string[] })),
      saveDeviceConfig: vi.fn(async () => true) };
    const record: DeviceV2PageLayoutRecord = { logicalDeviceId: id, revision: 7,
      manifestFingerprint: fingerprint, createdAt: 1, updatedAt: 2, layout: structuredClone(layout) };
    const layouts = { get: vi.fn(async () => record as DeviceV2PageLayoutRecord | null),
      saveCandidate: vi.fn(async (_id: string, candidate: PageLayout, _endpoints: unknown, revision: number) => ({
        ...record, revision: revision + 1, layout: { ...candidate, revision: revision + 1 },
      })) };
    const consoles = { get: vi.fn(async () => structuredClone(stored)),
      save: vi.fn(async (_id: string, change: { layout?: PageLayout; uiConfig?: DeviceConsole['uiConfig'] }) => {
        stored = { ...stored, revision: stored.revision + 1,
          layout: change.layout ? { ...structuredClone(change.layout), revision: change.layout.revision + 1 } : stored.layout,
          uiConfig: { ...stored.uiConfig, ...change.uiConfig } };
        return structuredClone(stored);
      }) };
    const page = new DeviceComponentsPage({ snapshot: { paramMap: { get: () => id } } } as never,
      data as never, devices as never, layouts as never, port as never,
      { markForCheck: vi.fn() } as never, consoles as never);
    pages.push(page);
    const source = () => structuredClone(stored);
    const replace = (next: DeviceConsole) => { stored = structuredClone(next); };
    const toggle = (checked: boolean) => ({ detail: { checked }, target: { checked } }) as unknown as CustomEvent<{ checked: boolean }>;
    const oldApisUnused = () => {
      expect(devices.loadDeviceConfig).not.toHaveBeenCalled();
      expect(devices.saveDeviceConfig).not.toHaveBeenCalled();
      expect(layouts.get).not.toHaveBeenCalled();
      expect(layouts.saveCandidate).not.toHaveBeenCalled();
    };
    return { id, page, device, data, port, close, state, layout, record, devices, layouts, consoles,
      source, replace, toggle, oldApisUnused };
  }

  it('loads cloud owner config and layout together through Console without either old API', async () => {
    const f = setup(), before = f.source(); before.uiConfig.hiddenEndpointKeys = ['temperature']; f.replace(before);
    await f.page.load();
    expect(f.consoles.get).toHaveBeenCalledExactlyOnceWith(f.id);
    expect(f.page.configReady).toBe(true);
    expect(f.page.loading).toBe(false);
    expect(f.page.error).toBe('');
    expect(f.page.layout).toEqual(f.layout);
    expect(f.page.rows.find(row => row.key === 'temperature')?.visible).toBe(false);
    expect(f.device.config.canEditConsole).toBe(true);
    expect(f.port.openConnection).toHaveBeenCalledExactlyOnceWith(f.id);
    f.oldApisUnused();
  });

  it('treats a null Console layout as absent without falling back to page-layout', async () => {
    const f = setup(), source = f.source(); source.layout = null; f.replace(source);
    await f.page.load();
    expect(f.page.configReady).toBe(true);
    expect(f.page.layout).toBeUndefined();
    await f.page.openStyle('temperature');
    expect(f.page.editing?.revision).toBe(0);
    expect(f.page.editing?.widget.endpointKey).toBe('temperature');
    f.oldApisUnused();
  });

  it('opens and saves cloud style with layout revision 7, preserving other positions, options and order', async () => {
    const f = setup(); await f.page.load(); await f.page.openStyle('temperature');
    expect(f.page.editing?.revision).toBe(7);
    f.page.updateStyleWidget({ ...f.page.editing!.widget, title: '新的温度名称' });
    await f.page.saveStyle();
    expect(f.consoles.save).toHaveBeenCalledExactlyOnceWith(f.id, { layout: { ...f.layout,
      widgets: [f.layout.widgets[0], { ...f.layout.widgets[1], title: '新的温度名称' }] } });
    expect(f.page.layout?.revision).toBe(8);
    expect(f.page.layout?.widgets[0]).toEqual(f.layout.widgets[0]);
    expect(f.page.editing).toBeUndefined();
    expect(f.source().revision).toBe(102); // Console revision is deliberately not the layout's CAS token.
    f.oldApisUnused();
  });

  it('round-trips historical full-row controls through Console without inserting new variants or resizing', async () => {
    const f = setup(), source = f.source();
    source.layout!.widgets = source.layout!.widgets.map((widget, i) => ({
      widgetId: widget.widgetId, endpointKey: widget.endpointKey, type: 'value',
      grid: { x: 0, y: i, width: 8, height: 1 },
    }));
    f.replace(source); await f.page.load(); await f.page.openStyle('temperature');
    await f.page.saveStyle();
    expect(f.consoles.save).toHaveBeenCalledExactlyOnceWith(f.id, { layout: source.layout });
    expect(f.page.layout?.widgets).toEqual(source.layout!.widgets);
    f.oldApisUnused();
  });

  it('hides a cloud field with a uiConfig-only Console change, leaving its saved layout intact', async () => {
    const f = setup(); await f.page.load();
    await f.page.setVisible('temperature', f.toggle(false));
    expect(f.consoles.save).toHaveBeenCalledExactlyOnceWith(f.id, { uiConfig: { hiddenEndpointKeys: ['temperature'] } });
    expect(f.page.layout).toEqual(f.layout);
    expect(f.device.config.hiddenEndpointKeys).toEqual(['temperature']);
    f.oldApisUnused();
  });

  it('restores a hidden cloud field already in the layout without rewriting the layout', async () => {
    const f = setup(), source = f.source(); source.uiConfig.hiddenEndpointKeys = ['temperature']; f.replace(source);
    await f.page.load(); await f.page.setVisible('temperature', f.toggle(true));
    expect(f.consoles.save).toHaveBeenCalledExactlyOnceWith(f.id, { uiConfig: { hiddenEndpointKeys: [] } });
    expect(f.page.layout?.widgets).toEqual(f.layout.widgets);
    f.oldApisUnused();
  });

  it('restores a missing cloud widget and its visibility in one Console save without moving other widgets', async () => {
    const f = setup(), source = f.source(); source.uiConfig.hiddenEndpointKeys = ['temperature'];
    source.layout!.widgets = [source.layout!.widgets[0]]; f.replace(source);
    await f.page.load(); await f.page.setVisible('temperature', f.toggle(true));
    expect(f.consoles.save).toHaveBeenCalledOnce();
    const change = f.consoles.save.mock.calls[0][1];
    expect(change.uiConfig).toEqual({ hiddenEndpointKeys: [] });
    expect(change.layout?.revision).toBe(7);
    expect(change.layout?.widgets[0]).toEqual(f.layout.widgets[0]);
    expect(change.layout?.widgets[1]).toMatchObject({ endpointKey: 'temperature', grid: { y: 6 } });
    expect(f.page.layout?.revision).toBe(8);
    expect(f.device.config.hiddenEndpointKeys).toEqual([]);
    f.oldApisUnused();
  });

  it('keeps cloud configuration unready on a failed read, without interpreting errors as missing layout or falling back', async () => {
    const f = setup(); f.consoles.get.mockRejectedValueOnce(new Error('unavailable'));
    await f.page.load();
    expect(f.page.configReady).toBe(false);
    expect(f.page.error).toBe('读取组件配置失败，请重试。');
    await f.page.setVisible('temperature', f.toggle(false));
    expect(f.consoles.save).not.toHaveBeenCalled();
    f.oldApisUnused();
    await f.page.load();
    expect(f.page.configReady).toBe(true);
    expect(f.page.error).toBe('');
    expect(f.port.openConnection).toHaveBeenCalledOnce();
  });

  it('retains the cloud property draft and previous layout after conflict, without automatically retrying', async () => {
    const f = setup(); await f.page.load(); await f.page.openStyle('temperature');
    f.page.updateStyleWidget({ ...f.page.editing!.widget, title: '失败保留草稿' });
    const draft = structuredClone(f.page.editing), previous = f.page.layout;
    f.consoles.save.mockRejectedValueOnce(new Error('layout-conflict'));
    await f.page.saveStyle();
    expect(f.consoles.save).toHaveBeenCalledOnce();
    expect(f.page.editing).toEqual(draft);
    expect(f.page.layout).toBe(previous);
    expect(f.page.error).toBe('样式保存失败，请重试。');
    await f.page.saveStyle();
    expect(f.page.error).toBe('');
    expect(f.page.editing).toBeUndefined();
    f.oldApisUnused();
  });

  it('rolls back a failed hidden-widget restore without partially accepting its layout or visibility', async () => {
    const f = setup(), source = f.source(); source.uiConfig.hiddenEndpointKeys = ['temperature'];
    source.layout!.widgets = [source.layout!.widgets[0]]; f.replace(source);
    await f.page.load(); const previous = structuredClone(f.page.layout), event = f.toggle(true);
    f.consoles.save.mockRejectedValueOnce(new Error('save-failed'));
    await f.page.setVisible('temperature', event);
    expect((event.target as HTMLIonToggleElement).checked).toBe(false);
    expect(f.page.layout).toEqual(previous);
    expect(f.device.config.hiddenEndpointKeys).toEqual(['temperature']);
    expect(f.page.error).toBe('保存失败，开关已恢复。请重试。');
    expect(f.consoles.save).toHaveBeenCalledOnce();
    f.oldApisUnused();
  });

  it('rejects invalid raw style input, incompatible bindings and invalid layout base revisions before a cloud PUT', async () => {
    const f = setup(); await f.page.load(); await f.page.openStyle('temperature');
    f.page.setStyleInvalid(true); await f.page.saveStyle();
    expect(f.consoles.save).not.toHaveBeenCalled();
    f.page.setStyleInvalid(false);
    f.page.updateStyleWidget({ ...f.page.editing!.widget, endpointKey: 'missing-field' });
    await f.page.saveStyle(); expect(f.consoles.save).not.toHaveBeenCalled();
    f.page.updateStyleWidget(f.layout.widgets[1]); f.page.editing!.revision = -1;
    await f.page.saveStyle(); expect(f.consoles.save).not.toHaveBeenCalled();
    expect(f.page.editing).toBeDefined(); f.oldApisUnused();
  });

  it('does not install a delayed cloud read after account/session scope changes', async () => {
    const f = setup(), pending = deferred<DeviceConsole>(), source = f.source();
    source.uiConfig.hiddenEndpointKeys = ['temperature']; f.consoles.get.mockReturnValueOnce(pending.promise);
    const load = f.page.load(); f.data.sessionEpoch++;
    pending.resolve(source); await load;
    expect(f.page.configReady).toBe(false);
    expect(f.page.layout).toBeUndefined();
    expect(f.device.config.hiddenEndpointKeys).toEqual([]);
    expect(f.device.config.canEditConsole).toBeUndefined();
    f.oldApisUnused();
  });

  it('does not accept a delayed cloud save into a changed account scope or discard its draft', async () => {
    const f = setup(); await f.page.load(); await f.page.openStyle('temperature');
    const draft = f.page.editing, previous = f.page.layout, pending = deferred<DeviceConsole>();
    f.consoles.save.mockReturnValueOnce(pending.promise);
    const save = f.page.saveStyle(); f.data.auth = { uuid: 'another-account' }; f.data.sessionEpoch++;
    const source = f.source(); source.uiConfig.hiddenEndpointKeys = ['temperature']; source.layout!.revision = 8;
    pending.resolve(source); await save;
    expect(f.page.editing).toBe(draft);
    expect(f.page.layout).toBe(previous);
    expect(f.device.config.hiddenEndpointKeys).toEqual([]);
    f.oldApisUnused();
  });

  it('does not install a delayed read after page destruction', async () => {
    const f = setup(), pending = deferred<DeviceConsole>(); f.consoles.get.mockReturnValueOnce(pending.promise);
    const load = f.page.load(); f.page.ngOnDestroy(); pending.resolve(f.source()); await load;
    expect(f.page.configReady).toBe(false);
    expect(f.device.config.canEditConsole).toBeUndefined();
    expect(f.close).toHaveBeenCalledOnce();
  });

  it('keeps owner-only admission and respects denied Console edit capability', async () => {
    const shared = setup({ shared: true }); await shared.page.load();
    expect(shared.page.error).toBe('仅设备所有者可以配置组件。');
    expect(shared.consoles.get).not.toHaveBeenCalled(); expect(shared.port.openConnection).not.toHaveBeenCalled();
    const owner = setup(), source = owner.source(); source.capabilities.canEditConsole = false; owner.replace(source);
    await owner.page.load();
    expect(owner.page.configReady).toBe(false);
    expect(owner.page.error).toBe('读取组件配置失败，请重试。');
    owner.oldApisUnused();
  });

  it.each([{ cloud: false }, { cloud: true, preview: true }])('keeps non-cloud/preview reads and style writes on the original API: %j', async options => {
    const f = setup(options); await f.page.load();
    expect(f.devices.loadDeviceConfig).toHaveBeenCalledExactlyOnceWith(f.device);
    expect(f.layouts.get).toHaveBeenCalledExactlyOnceWith(f.id);
    await f.page.openStyle('temperature'); await f.page.saveStyle();
    expect(f.layouts.saveCandidate).toHaveBeenCalledWith(f.id, f.layout, f.state.value.endpoints, 7);
    await f.page.setVisible('temperature', f.toggle(false));
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledWith(f.device, { hiddenEndpointKeys: ['temperature'] });
    expect(f.consoles.get).not.toHaveBeenCalled(); expect(f.consoles.save).not.toHaveBeenCalled();
  });

  it('keeps a missing non-cloud widget restoration on the existing get/saveCandidate/config sequence', async () => {
    const f = setup({ cloud: false }); f.record.layout.widgets = [f.record.layout.widgets[0]];
    f.devices.loadDeviceConfig.mockResolvedValueOnce({ hiddenEndpointKeys: ['temperature'] });
    await f.page.load(); await f.page.setVisible('temperature', f.toggle(true));
    expect(f.layouts.saveCandidate).toHaveBeenCalledOnce();
    expect(f.layouts.saveCandidate.mock.calls[0][3]).toBe(7);
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledExactlyOnceWith(f.device, { hiddenEndpointKeys: [] });
    expect(f.consoles.get).not.toHaveBeenCalled(); expect(f.consoles.save).not.toHaveBeenCalled();
  });
});
