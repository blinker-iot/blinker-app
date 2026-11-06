import { BehaviorSubject, Subject } from 'rxjs';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceConsole } from '../../../core/services/device-console.service';
import { CustomPanelEditorComponent } from './custom-panel-editor.component';

describe('custom panel Console aggregate CAS', () => {
  function setup() {
    const device = { id: 'custom-cas', deviceName: 'custom-cas', cloudEnabled: true,
      config: { mode: 'bbp2', customPanel: { version: 1, html: '<main>原预览</main>', theme: 'natural' } },
      data: {}, storage: {}, subject: new Subject() } as unknown as BlinkerDevice;
    const host = { sessionVersion: 1, activeChanges: new BehaviorSubject(true), sessionChanges: new Subject() };
    const source: DeviceConsole = { logicalDeviceId: device.id, name: '测试', deviceType: 'WiFi', revision: 103,
      layout: null, uiConfig: {}, defaultMode: 'custom', availableModes: ['normal', 'custom'],
      capabilities: { canRead: true, canCommand: true, commandEndpointKeys: null, canEditConsole: true, canManageSharing: true } };
    const consoles = { save: vi.fn(async () => source), get: vi.fn() }, nav = { navigateRoot: vi.fn(async () => undefined) };
    const component = new CustomPanelEditorComponent({} as never, {} as never, {} as never, nav as never,
      {} as never, { markForCheck: vi.fn() } as never, consoles as never, host as never);
    component.device = device; component.ready = true; component.consoleRevision = 101; component.ngOnChanges();
    return { component, consoles, host, nav, device, source };
  }

  it('holds the read aggregate revision and adopts the actual response version', async () => {
    const f = setup();
    try {
      expect(f.component.canApply).toBe(true); await f.component.apply(); await f.component.apply();
      expect(f.consoles.save.mock.calls.map(call => (call as any)[2])).toEqual([101, 103]);
      expect(f.consoles.get).not.toHaveBeenCalled();
    } finally { f.component.ngOnDestroy(); }
  });

  it('retains the preview but blocks repeat save and does not adopt a changed input token after conflict', async () => {
    const f = setup(), draft = f.component.preview;
    try {
      f.consoles.save.mockRejectedValueOnce({ code: 'DEVICE_CONSOLE_CONFLICT' }); await f.component.apply();
      expect(f.component.preview).toBe(draft); expect(f.component.canApply).toBe(false);
      expect(f.component.error).toContain('重新打开读取后确认');
      f.component.consoleRevision = 999; f.component.ngOnChanges(); await f.component.apply();
      expect(f.consoles.save).toHaveBeenCalledOnce(); expect(f.consoles.get).not.toHaveBeenCalled();
      expect(f.nav.navigateRoot).not.toHaveBeenCalled();
    } finally { f.component.ngOnDestroy(); }
  });

  it('late Console rejection cannot retire a new device owner save or overwrite its preview', async () => {
    const f = setup(), busy = vi.fn(); f.component.busy.subscribe(busy);
    let rejectOld!: (error: unknown) => void, finishNew!: (value: DeviceConsole) => void;
    try {
      f.consoles.save.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }));
      const oldSave = f.component.apply();
      const next = { ...f.device, id: 'custom-next', deviceName: 'custom-next', config: { ...f.device.config,
        customPanel: { version: 1 as const, html: '<main>新设备预览</main>', theme: 'natural' as const } }, subject: new Subject() };
      f.component.device = next; f.component.consoleRevision = 201; f.component.ngOnChanges();
      const good = f.component.preview;
      f.consoles.save.mockReturnValueOnce(new Promise(resolve => { finishNew = resolve; }));
      const nextSave = f.component.apply(); expect(f.component.saving).toBe(true);
      rejectOld({ code: 'DEVICE_CONSOLE_CONFLICT' }); await oldSave;
      expect(f.component.saving).toBe(true); expect(busy).toHaveBeenLastCalledWith(true);
      expect(f.component.preview).toBe(good); expect(f.component.error).toBe('');
      finishNew({ ...f.source, logicalDeviceId: next.id, revision: 203 }); await nextSave;
      expect(f.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/device/custom-next');
      expect(f.consoles.save.mock.calls.map(call => (call as any)[2])).toEqual([101, 201]);
    } finally { f.component.ngOnDestroy(); }
  });
});
