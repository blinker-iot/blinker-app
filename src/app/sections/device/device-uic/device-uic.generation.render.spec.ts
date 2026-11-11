import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUicPage } from './device-uic.page';
import { InterfaceGenerationService, type InterfaceGenerationOptions } from './interface-generation.service';
import type { InterfaceTile } from './interface-draft';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { NoticeService } from '../../../core/services/notice.service';
import { DeviceUiPort, type DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { DeviceV2PageLayoutService } from '../../../core/services/device-v2-page-layout.service';
import { DevicePanelService } from '../../../core/services/device-panel.service';
import { DeviceConsoleService, type DeviceConsole } from '../../../core/services/device-console.service';
import type { BlinkerDevice } from '../../../core/model/device.model';

describe('QA5 AI component generation original template ownership', () => {
  const snapshot: DeviceUiSnapshot = {
    manifestAccepted: true, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateRevision: 1, stateFresh: true,
    endpoints: [{ id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true, value: false }],
  };
  function device(name = 'A'): BlinkerDevice {
    return { id: 'device-a', deviceName: 'device-a', config: { mode: 'bbp2', broker: 'test', customName: name,
      layouter: '{"dashboard":[]}' }, data: {}, storage: {}, subject: new Subject() };
  }
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))));
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  async function mount(cloud = false) {
    const model = device(), data = { device: { dict: { 'device-a': model } }, userDataLoader: new BehaviorSubject(false), sessionEpoch: 1 };
    model.cloudEnabled = cloud;
    const appActive = new BehaviorSubject(true), state = new BehaviorSubject(snapshot);
    const writes = { saveDeviceConfig: vi.fn(), saveCandidate: vi.fn(), save: vi.fn(), sendCommand: vi.fn() };
    let consoleRevision = 101;
    const consoleRecord = (): DeviceConsole => ({ logicalDeviceId: 'device-a', name: '测试', deviceType: 'WiFi',
      revision: consoleRevision, layout: null, uiConfig: {}, defaultMode: 'normal', availableModes: ['normal'],
      capabilities: { canRead: true, canCommand: true, commandEndpointKeys: null, canEditConsole: true, canManageSharing: true } });
    const consoles = { get: vi.fn(async () => consoleRecord()), save: writes.save };
    writes.save.mockImplementation(async (_id, change) => ({ ...consoleRecord(), revision: consoleRevision += 2,
      layout: change.layout ? { ...change.layout, revision: 1 } : null }));
    const nav = { navigateRoot: vi.fn(), navigateForward: vi.fn(), navigateBack: vi.fn() };
    const calls: { options: InterfaceGenerationOptions; resolve: (result: { summary: string; tiles: InterfaceTile[] }) => void;
      reject: (error: unknown) => void }[] = [];
    const generate = vi.fn((_prompt: string, _tiles: InterfaceTile[], _style: string, options: InterfaceGenerationOptions) =>
      new Promise((resolve, reject) => calls.push({ options, resolve, reject })));
    await TestBed.configureTestingModule({ imports: [DeviceUicPage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'device-a' }, data: { method: 'ai' } } } },
      { provide: NavController, useValue: nav },
      { provide: DataService, useValue: data }, { provide: DeviceService, useValue: writes },
      { provide: NoticeService, useValue: { showToast: vi.fn() } },
      { provide: DeviceUiPort, useValue: { appActive, watchState: () => state, watchConnection: () => new BehaviorSubject('ready'),
        watchEvents: () => new Subject(), isBleDirect: () => false, sendCommand: writes.sendCommand,
        openConnection: () => ({ ready: Promise.resolve(), close: vi.fn() }) } },
      { provide: DeviceV2PageLayoutService, useValue: { get: vi.fn(async () => ({ revision: 2 })), saveCandidate: writes.saveCandidate } },
      { provide: InterfaceGenerationService, useValue: { generate } },
      { provide: DevicePanelService, useValue: { get: vi.fn(async () => null), save: writes.save } },
      { provide: DeviceConsoleService, useValue: consoles },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(DeviceUicPage); fixture.detectChanges();
    await vi.waitFor(() => { fixture.detectChanges(); expect(fixture.componentInstance.sourceTiles).toHaveLength(1); });
    await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
    fixture.nativeElement.querySelector('.preview-section').scrollIntoView = vi.fn();
    const click = () => {
      fixture.detectChanges(); const button = fixture.nativeElement.querySelector('.generate-button') as HTMLButtonElement;
      expect(button.disabled).toBe(false); button.click(); fixture.detectChanges();
      return calls.at(-1)!;
    };
    const result = (summary = 'good') => ({ summary, tiles: [...fixture.componentInstance.sourceTiles] });
    const complete = async (call: typeof calls[number], summary = 'good') => {
      call.resolve(result(summary)); await Promise.resolve(); await Promise.resolve(); fixture.detectChanges();
    };
    return { fixture, page: fixture.componentInstance, data, appActive, calls, writes, generate, click, result, complete,
      consoles, nav, setConsoleRevision: (value: number) => { consoleRevision = value; } };
  }

  it.each(['complete', 'error'])('cancels on background, ignores late %s and keeps the last good draft without restarting', async outcome => {
    const t = await mount(); await t.complete(t.click()); const good = t.page.tiles;
    const call = t.click(); call.options.onPreview?.({ summary: 'partial', tiles: [] });
    t.appActive.next(false); t.fixture.detectChanges();
    expect(call.options.signal?.aborted).toBe(true); expect(t.page.generating).toBe(false);
    expect(t.page.tiles).toEqual(good); expect(t.page.canApply).toBe(false);
    call.options.onProgress?.('late'); call.options.onPreview?.({ summary: 'late', tiles: [] });
    if (outcome === 'complete') await t.complete(call, 'late');
    else { call.reject(new Error('late-error')); await Promise.resolve(); await Promise.resolve(); t.fixture.detectChanges(); }
    t.appActive.next(true); t.fixture.detectChanges();
    expect(t.page.tiles).toEqual(good); expect(t.page.summary).toBe('good'); expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.writes.save).not.toHaveBeenCalled(); expect(t.writes.sendCommand).not.toHaveBeenCalled();
  });

  it('retires the old account before restored inventory and rejects its same-manifest late result', async () => {
    const t = await mount(), call = t.click();
    t.data.sessionEpoch++; t.data.userDataLoader.next(false); t.fixture.detectChanges();
    expect(call.options.signal?.aborted).toBe(true);
    call.options.onPreview?.({ summary: 'private-old', tiles: [] }); await t.complete(call, 'private-old');
    expect(t.page.summary).not.toBe('private-old'); expect(t.page.generated).toBe(false);
    expect(t.generate).toHaveBeenCalledOnce(); expect(t.writes.save).not.toHaveBeenCalled();
  });

  it('does not cancel on a loader notification with unchanged account/device/manifest', async () => {
    const t = await mount(), call = t.click(); t.data.userDataLoader.next(false); t.fixture.detectChanges();
    expect(call.options.signal?.aborted).toBe(false); await t.complete(call);
    expect(t.page.generated).toBe(true); expect(t.generate).toHaveBeenCalledOnce();
  });

  it('does not start another request when cached navigation returns after cancellation', async () => {
    const t = await mount(), call = t.click(); t.page.ionViewDidLeave();
    call.options.onPreview?.({ summary: 'late', tiles: [] }); await t.complete(call, 'late');
    t.page.ionViewWillEnter(); await Promise.resolve(); t.fixture.detectChanges();
    expect(t.generate).toHaveBeenCalledOnce(); expect(t.page.summary).not.toBe('late');
    expect(t.writes.saveCandidate).not.toHaveBeenCalled();
  });

  it('Cloud AI adopts through one Console write with aggregate CAS and its actual returned version', async () => {
    const t = await mount(true); await t.complete(t.click());
    const apply = [...t.fixture.nativeElement.querySelectorAll('button.apply-button')].find((button: any) => button.textContent.includes('应用这个界面')) as HTMLButtonElement;
    expect(apply.disabled).toBe(false); apply.click();
    await vi.waitFor(() => expect(t.page.saving).toBe(false));
    expect(t.writes.save).toHaveBeenCalledExactlyOnceWith('device-a', expect.objectContaining({
      layout: expect.objectContaining({ revision: 1 }), uiConfig: { panelMode: 'normal' } }), 101);
    expect(t.page.consoleRevision).toBe(103); expect(t.nav.navigateRoot).toHaveBeenCalledExactlyOnceWith('/device/device-a');
    expect(t.consoles.get).toHaveBeenCalledOnce(); expect(t.writes.saveCandidate).not.toHaveBeenCalled();
    expect(t.writes.saveDeviceConfig).not.toHaveBeenCalled(); expect(t.writes.sendCommand).not.toHaveBeenCalled();
  });

  it('Cloud AI conflict retains its complete draft, blocks stale apply and offers an explicit original-template read', async () => {
    const t = await mount(true); await t.complete(t.click()); const good = t.page.tiles;
    t.writes.save.mockRejectedValueOnce({ code: 'DEVICE_CONSOLE_CONFLICT' });
    const apply = () => [...t.fixture.nativeElement.querySelectorAll('button.apply-button')].find((button: any) => button.textContent.includes('应用这个界面')) as HTMLButtonElement;
    apply().click(); await vi.waitFor(() => expect(t.page.saving).toBe(false)); t.fixture.detectChanges();
    expect(t.page.tiles).toBe(good); expect(t.page.generated).toBe(true); expect(t.page.canApply).toBe(false);
    expect(t.fixture.nativeElement.querySelector('.generate-feedback[role="alert"]').textContent).toContain('重新读取后确认');
    expect(apply().disabled).toBe(true); apply().click();
    expect(t.writes.save).toHaveBeenCalledOnce(); expect(t.consoles.get).toHaveBeenCalledOnce();
    expect(t.nav.navigateRoot).not.toHaveBeenCalled();
    const read = t.fixture.nativeElement.querySelector('.generate-feedback button') as HTMLButtonElement;
    expect(read.textContent.trim()).toBe('重新读取'); expect(read.disabled).toBe(false);
    t.setConsoleRevision(151); read.click(); await vi.waitFor(() => expect(t.page.loading).toBe(false)); t.fixture.detectChanges();
    expect(t.consoles.get).toHaveBeenCalledTimes(2); expect(t.page.consoleRevision).toBe(151);
    expect(t.page.generated).toBe(true); expect(t.page.tiles).toEqual(good); expect(apply().disabled).toBe(false);
    expect(t.generate).toHaveBeenCalledOnce(); expect(t.writes.save).toHaveBeenCalledOnce();
  });

  it('Cloud AI failed save keeps the complete preview without navigation, refresh or automatic retry', async () => {
    const t = await mount(true); await t.complete(t.click()); const good = t.page.tiles;
    t.writes.save.mockRejectedValueOnce(new Error('offline'));
    await t.page.apply(); t.fixture.detectChanges();
    expect(t.page.tiles).toBe(good); expect(t.page.generated).toBe(true); expect(t.page.consoleRevision).toBe(101);
    expect(t.page.error).toContain('保存失败'); expect(t.nav.navigateRoot).not.toHaveBeenCalled();
    expect(t.writes.save).toHaveBeenCalledOnce(); expect(t.consoles.get).toHaveBeenCalledOnce();
    expect(t.generate).toHaveBeenCalledOnce();
  });

  it('late Cloud rejection cannot replace a new account owner draft or block its apply', async () => {
    const t = await mount(true); await t.complete(t.click(), 'old-owner');
    let rejectOld!: (error: unknown) => void;
    t.writes.save.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }));
    const oldSave = t.page.apply(); expect(t.page.saving).toBe(true);
    t.data.sessionEpoch++; t.data.userDataLoader.next(false); t.fixture.detectChanges();
    await vi.waitFor(() => expect(t.page.loading).toBe(false));
    await t.complete(t.click(), 'new-owner'); const good = t.page.tiles;
    expect(t.page.canApply).toBe(true);
    rejectOld({ code: 'DEVICE_CONSOLE_CONFLICT' }); await oldSave; t.fixture.detectChanges();
    expect(t.page.tiles).toBe(good); expect(t.page.summary).toBe('new-owner');
    expect(t.page.generated).toBe(true); expect(t.page.canApply).toBe(true);
    expect(t.page.consoleRefreshRequired).toBe(false); expect(t.page.error).toBe('');
    expect(t.nav.navigateRoot).not.toHaveBeenCalled(); expect(t.writes.save).toHaveBeenCalledOnce();
  });
});
