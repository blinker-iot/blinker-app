import { BehaviorSubject, Subject } from 'rxjs';

import { API } from '../../../configs/api.config';
import { DeviceSettingsPage } from './device-settings';

const deviceId = 'device_panel_mode_test';
const preferenceKey = (id = deviceId) => `blinker-device-panel-mode:${API.BASE_URL}:${id}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(shared = false) {
  const device: any = {
    id: deviceId, deviceName: deviceId, deviceType: 'wifi',
    config: {
      mode: 'bbp2', component: 'DeviceV2', panelMode: 'normal', isShared: shared,
      customName: '测试灯', image: 'diyarduino.png',
      layouter: '{"saved-layout":"keep-exactly"}',
      customPanel: { version: 1, html: '<main>Saved custom document</main>', theme: 'dark' },
    },
    data: {}, storage: {}, subject: { next: vi.fn() },
  };
  const registry = new Map([[deviceId, device]]);
  const route = {
    paramMap: new BehaviorSubject({ get: (name: string): string | null => name === 'id' ? deviceId : null }),
  };
  const data = {
    auth: { uuid: 'panel-owner' } as { uuid: string } | null, sessionEpoch: 1,
    authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(true),
    userDataLoader: new Subject<boolean>(), getDevice: vi.fn((id: string) => registry.get(id)),
  };
  const devices = { saveDeviceConfig: vi.fn().mockResolvedValue(true) };
  const panels = { get: vi.fn().mockResolvedValue(null), setView: vi.fn(), install: vi.fn() };
  const nav = { navigateForward: vi.fn().mockResolvedValue(true) };
  const notice = { showToast: vi.fn().mockResolvedValue(undefined) };
  const cd = { markForCheck: vi.fn() };
  const page = new DeviceSettingsPage(
    route as any, {} as any, devices as any, data as any, {} as any, nav as any,
    {} as any, {} as any, {} as any, { isAvailable: false } as any, notice as any,
    cd as any, undefined, panels as any,
  );
  page.ngOnInit();
  return { page, device, registry, route, data, devices, panels, nav, notice, cd };
}

describe('Device settings display-mode draft and existing persistence', () => {
  const fixtures: ReturnType<typeof harness>[] = [];
  function setup(shared = false) {
    const fixture = harness(shared);
    fixtures.push(fixture);
    return fixture;
  }

  beforeEach(() => {
    localStorage.removeItem(preferenceKey());
  });
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) fixture.page.ngOnDestroy();
    vi.restoreAllMocks();
    localStorage.removeItem(preferenceKey());
  });

  it('opens and cancels without saving, changing documents or emitting a component change', () => {
    const f = setup(), original = structuredClone(f.device.config);
    f.page.openPanelModeSelector();
    expect(f.page.panelModeSelectionOpen).toBe(true);
    f.page.closePanelModeSelector();
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(f.panels.setView).not.toHaveBeenCalled();
    expect(f.device.subject.next).not.toHaveBeenCalled();
    expect(f.device.config).toEqual(original);
    expect(localStorage.getItem(preferenceKey())).toBeNull();
  });

  it('confirms one owner patch while preserving saved layout, custom document and its theme', async () => {
    const f = setup(), original = structuredClone(f.device.config);
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledExactlyOnceWith(f.device,
      { panelMode: 'custom', component: 'DeviceV2' });
    expect(f.page.panelMode).toBe('custom');
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.device.config).toEqual({ ...original, panelMode: 'custom' });
    expect(f.device.subject.next).toHaveBeenCalledExactlyOnceWith({
      key: 'component', value: 'DeviceV2', source: 'device-settings',
    });
    expect(f.panels.setView).not.toHaveBeenCalled();
    expect(localStorage.getItem(preferenceKey())).toBeNull();
  });

  it('reuses the same owner path when switching from custom back to normal', async () => {
    const f = setup(), customPanel = f.device.config.customPanel;
    f.device.config.panelMode = 'custom';
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('normal');
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledExactlyOnceWith(f.device,
      { panelMode: 'normal', component: 'DeviceV2' });
    expect(f.device.config.customPanel).toBe(customPanel);
    expect(f.page.panelMode).toBe('normal');
  });

  it.each(['rejected', 'false'] as const)('retains current mode and open draft after %s owner save', async failure => {
    const f = setup(), original = structuredClone(f.device.config);
    if (failure === 'rejected') f.devices.saveDeviceConfig.mockRejectedValueOnce(new Error('unavailable'));
    else f.devices.saveDeviceConfig.mockResolvedValueOnce(false);
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(f.page.panelModeSelectionOpen).toBe(true);
    expect(f.page.panelModeError).toContain('未能保存');
    expect(f.page.panelMode).toBe('normal');
    expect(f.device.config).toEqual(original);
    expect(f.device.subject.next).not.toHaveBeenCalled();
    expect(f.page.panelModeSaving).toBe(false);
  });

  it('allows a retry after failure without changing the documents or carrying a false success', async () => {
    const f = setup();
    f.devices.saveDeviceConfig.mockResolvedValueOnce(false);
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(f.page.panelModeError).not.toBe('');
    await f.page.confirmPanelMode('custom');
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledTimes(2);
    expect(f.page.panelMode).toBe('custom');
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.page.panelModeError).toBe('');
  });

  it('confirms a shared preference locally without modifying owner config or calling its APIs', async () => {
    const f = setup(true), original = structuredClone(f.device.config);
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(localStorage.getItem(preferenceKey())).toBe('custom');
    expect(f.page.panelMode).toBe('custom');
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.device.config).toEqual(original);
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(f.panels.setView).not.toHaveBeenCalled();
    expect(f.device.subject.next).toHaveBeenCalledOnce();
  });

  it('keeps a shared draft open if local preference storage fails', async () => {
    const f = setup(true), original = structuredClone(f.device.config);
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(write).toHaveBeenCalledExactlyOnceWith(preferenceKey(), 'custom');
    expect(f.page.panelModeSelectionOpen).toBe(true);
    expect(f.page.panelModeError).toContain('未能保存');
    expect(f.page.panelMode).toBe('normal');
    expect(f.device.config).toEqual(original);
    expect(f.device.subject.next).not.toHaveBeenCalled();
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
  });

  it('uses the existing creation route for an owner without pretending custom was applied', async () => {
    const f = setup();
    delete f.device.config.customPanel;
    const original = structuredClone(f.device.config);
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(f.nav.navigateForward).toHaveBeenCalledExactlyOnceWith(`/device-manager/${deviceId}/uic/custom`);
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(f.device.subject.next).not.toHaveBeenCalled();
    expect(f.device.config).toEqual(original);
    expect(f.page.panelMode).toBe('normal');
    expect(f.page.panelModeSelectionOpen).toBe(false);
  });

  it('rejects a shared custom selection when no document exists', async () => {
    const f = setup(true);
    delete f.device.config.customPanel;
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('custom');
    expect(f.nav.navigateForward).not.toHaveBeenCalled();
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(localStorage.getItem(preferenceKey())).toBeNull();
    expect(f.page.panelMode).toBe('normal');
    expect(f.page.panelModeSelectionOpen).toBe(true);
  });

  it('treats confirming the current mode as a no-write close', async () => {
    const f = setup();
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('normal');
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(f.device.subject.next).not.toHaveBeenCalled();
  });

  it('ignores invalid runtime mode values', async () => {
    const f = setup();
    f.page.openPanelModeSelector();
    await f.page.confirmPanelMode('debug' as any);
    await f.page.setPanelMode('debug' as any);
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(f.device.subject.next).not.toHaveBeenCalled();
    expect(f.page.panelModeSelectionOpen).toBe(true);
  });

  it('prevents duplicate confirmation and ordinary dismissal while a save is in flight', async () => {
    const f = setup(), pending = deferred<boolean>();
    f.devices.saveDeviceConfig.mockReturnValueOnce(pending.promise);
    f.page.openPanelModeSelector();
    const first = f.page.confirmPanelMode('custom');
    expect(f.page.panelModeSaving).toBe(true);
    await f.page.confirmPanelMode('custom');
    f.page.closePanelModeSelector();
    expect(f.page.canDismissPanelMode()).toBe(false);
    expect(f.page.canDismissPanelMode(undefined, 'scope-change')).toBe(true);
    expect(f.page.panelModeSelectionOpen).toBe(true);
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledOnce();
    pending.resolve(true); await first;
    expect(f.page.panelModeSaving).toBe(false);
    expect(f.page.panelModeSelectionOpen).toBe(false);
  });

  it.each(['auth', 'route', 'leave', 'replacement'] as const)(
    'invalidates the unconfirmed draft after %s changes without writing', async change => {
      const f = setup();
      f.page.openPanelModeSelector();
      if (change === 'auth') {
        f.data.auth = { uuid: 'another-user' }; f.data.sessionEpoch++; f.data.authDataChanged.next();
      } else if (change === 'route') {
        f.route.paramMap.next({ get: name => name === 'id' ? 'other-device' : null });
      } else if (change === 'leave') f.page.ionViewWillLeave();
      else {
        f.registry.set(deviceId, { ...f.device, config: { ...f.device.config } });
        f.data.deviceDataLoader.next(true);
      }
      expect(f.page.panelModeSelectionOpen).toBe(false);
      await f.page.confirmPanelMode('custom');
      expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
      expect(localStorage.getItem(preferenceKey())).toBeNull();
    },
  );

  it('rechecks account epoch at confirmation even if its notification has not arrived yet', async () => {
    const f = setup();
    f.page.openPanelModeSelector();
    f.data.sessionEpoch++;
    await f.page.confirmPanelMode('custom');
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
    expect(f.page.panelModeSelectionOpen).toBe(false);
  });

  it('does not apply a late owner response after the account changed', async () => {
    const f = setup(), pending = deferred<boolean>(), original = structuredClone(f.device.config);
    f.devices.saveDeviceConfig.mockReturnValueOnce(pending.promise);
    f.page.openPanelModeSelector();
    const saving = f.page.confirmPanelMode('custom');
    f.data.auth = { uuid: 'another-user' }; f.data.sessionEpoch++; f.data.authDataChanged.next();
    pending.resolve(true); await saving;
    expect(f.device.config).toEqual(original);
    expect(f.device.subject.next).not.toHaveBeenCalled();
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.page.panelModeError).toBe('');
  });

  it.each(['route', 'leave'] as const)('does not reopen or assign a false selector error after %s during an accepted save', async change => {
    const f = setup(), pending = deferred<boolean>();
    f.devices.saveDeviceConfig.mockReturnValueOnce(pending.promise);
    f.page.openPanelModeSelector();
    const saving = f.page.confirmPanelMode('custom');
    if (change === 'route') {
      const other = { ...f.device, id: 'other-device', deviceName: 'other-device', config: { ...f.device.config } };
      f.registry.set('other-device', other);
      f.route.paramMap.next({ get: name => name === 'id' ? 'other-device' : null });
    } else f.page.ionViewWillLeave();
    pending.resolve(true); await saving;
    expect(f.page.panelModeSelectionOpen).toBe(false);
    expect(f.page.panelModeError).toBe('');
    expect(f.devices.saveDeviceConfig).toHaveBeenCalledOnce();
    // The already-confirmed request may succeed for its original device; leaving is not a server rollback.
    expect(f.device.config.panelMode).toBe('custom');
    if (change === 'route') expect(f.page.device.config.panelMode).toBe('normal');
  });

  it('waits for dismissal cleanup before accepting a new selector scope', () => {
    const f = setup();
    f.page.openPanelModeSelector();
    f.page.closePanelModeSelector();
    f.page.openPanelModeSelector();
    expect(f.page.panelModeSelectionOpen).toBe(false);
    f.page.panelModeDismissed();
    f.page.openPanelModeSelector();
    expect(f.page.panelModeSelectionOpen).toBe(true);
    expect(f.devices.saveDeviceConfig).not.toHaveBeenCalled();
  });
});
