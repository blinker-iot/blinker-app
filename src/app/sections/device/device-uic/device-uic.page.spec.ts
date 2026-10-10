import { BehaviorSubject, Subject } from 'rxjs';
import { DeviceUicPage } from './device-uic.page';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { capabilityTiles } from './interface-draft';

vi.mock('@ionic/angular', () => ({ AlertController: class {}, IonicModule: class {}, NavController: class {} }));
vi.mock('@ionic/angular/standalone', () => ({ AlertController: class {}, LoadingController: class {}, Platform: class {}, ToastController: class {} }));
const snapshot: DeviceUiSnapshot = {
  manifestAccepted: true, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateRevision: 1, stateFresh: true,
  endpoints: [
    { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true, value: true },
    { id: 2, key: 'temperature', role: 'property', valueType: 'number', readable: true, writable: false, notifies: true, value: 24.6, unit: '°C' },
  ],
};
describe('interface studio workflow', () => {
  let page: DeviceUicPage;
  let device: BlinkerDevice;
  let state: BehaviorSubject<DeviceUiSnapshot>;
  let navigateRoot: ReturnType<typeof vi.fn>;
  let saveConfig: ReturnType<typeof vi.fn>;
  let saveLayout: ReturnType<typeof vi.fn>;
  let generate: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    device = { id: 'device-1', deviceName: 'device-1', config: { mode: 'bbp2', broker: '', customName: '试验设备', layouter: '{"dashboard":[]}' }, data: {}, storage: {}, subject: new Subject() };
    state = new BehaviorSubject(snapshot);
    navigateRoot = vi.fn().mockResolvedValue(true);
    saveConfig = vi.fn().mockResolvedValue(true);
    saveLayout = vi.fn().mockResolvedValue({ revision: 3 });
    generate = vi.fn().mockResolvedValue({ summary: '开关优先', tiles: capabilityTiles(device, snapshot).slice(0, 1) });
    close = vi.fn();
    page = new DeviceUicPage(
      { snapshot: { paramMap: { get: () => 'device-1' } } } as never,
      { navigateRoot } as never, { create: vi.fn() } as never,
      { device: { dict: { 'device-1': device } }, userDataLoader: new BehaviorSubject(false) } as never,
      { saveDeviceConfig: saveConfig } as never, { showToast: vi.fn().mockResolvedValue(undefined) } as never,
      { watchState: () => state, openConnection: () => ({ ready: Promise.resolve(), close }) } as never,
      { get: vi.fn().mockResolvedValue({ revision: 2 }), saveCandidate: saveLayout } as never,
      { generate } as never, { markForCheck: vi.fn() } as never,
    );
    page.ngOnInit();
  });
  afterEach(() => page.ngOnDestroy());
  async function select(method: 'automatic' | 'ai' | 'classic') { page.selectMethod(method); await vi.waitFor(() => expect(page.loading).toBe(false)); }
  it('previews capabilities without saving or switching the device', async () => {
    await select('automatic');
    expect(page.tiles).toHaveLength(2);
    expect(page.canApply).toBe(true);
    expect(saveConfig).not.toHaveBeenCalled();
    expect(saveLayout).not.toHaveBeenCalled();
    page.chooseDensity('compact');
    expect(page.tiles.map(tile => tile.width)).toEqual([4, 4]);
  });
  it('saves a validated V2 layout with the current revision before switching', async () => {
    await select('automatic'); await page.apply();
    expect(saveLayout).toHaveBeenCalledWith('device-1', expect.objectContaining({ revision: 2 }), snapshot.endpoints, 2);
    expect(saveConfig).toHaveBeenCalledWith(device, { component: 'DeviceV2' });
    expect(navigateRoot).toHaveBeenCalledWith('/device/device-1');
    expect(device.config.layouter).toBe('{"dashboard":[]}');
  });
  it('keeps configuration and navigation unchanged if layout saving fails', async () => {
    await select('automatic'); saveLayout.mockRejectedValueOnce(new Error()); await page.apply();
    expect(saveConfig).not.toHaveBeenCalled(); expect(navigateRoot).not.toHaveBeenCalled(); expect(page.error).toContain('保存失败');
  });
  it('blocks stale revision writes until refresh', async () => {
    await select('automatic'); saveLayout.mockRejectedValueOnce({ code: 'DEVICE_V2_PAGE_LAYOUT_CONFLICT' }); await page.apply();
    expect(page.canApply).toBe(false); expect(page.error).toContain('其他位置');
    await page.refreshCapabilities(); expect(page.canApply).toBe(true);
  });
  it('reports a partial save and retains the new revision for retry', async () => {
    await select('automatic'); saveConfig.mockResolvedValueOnce(false); await page.apply();
    expect(device.config.component).toBeUndefined(); expect(navigateRoot).not.toHaveBeenCalled(); expect(page.error).toContain('布局已保存');
    await page.apply(); expect(saveLayout.mock.calls[1][3]).toBe(3);
  });
  it('requires AI generation before applying and preserves a good draft after failure', async () => {
    await select('ai'); expect(page.canApply).toBe(false);
    page.prompt = '开关在上面'; await page.generate(); expect(page.canApply).toBe(true); expect(page.tiles).toHaveLength(1);
    generate.mockRejectedValueOnce(new Error()); await page.generate(); expect(page.tiles).toHaveLength(1); expect(page.generated).toBe(true);
  });
  it('can generate from an accepted manifest while the device connection is still pending', async () => {
    (page as any).deviceUi.openConnection = () => ({ ready: new Promise(() => {}), close });
    await select('ai');
    expect(page.sourceTiles).toHaveLength(2);
    await page.generate();
    expect(generate).toHaveBeenCalledOnce();
    expect(page.generated).toBe(true);
    expect(page.canApply).toBe(true);
  });
  it('finishes a pending layout read after AI generation starts', async () => {
    let finishRead!: (value: unknown) => void;
    (page as any).pageLayouts.get = () => new Promise(resolve => { finishRead = resolve; });
    page.selectMethod('ai');
    expect(page.loading).toBe(true);
    await page.generate();
    expect(generate).toHaveBeenCalledOnce();
    expect(page.generated).toBe(true);
    expect(page.canApply).toBe(false);
    finishRead({ revision: 2 });
    await vi.waitFor(() => expect(page.loading).toBe(false));
    expect(page.canApply).toBe(true);
  });
  it('explains a missing accepted manifest when generation is requested', async () => {
    await select('ai');
    state.next({ ...snapshot, manifestAccepted: false });
    await page.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(page.error).toContain('尚未识别');
  });
  it('enables generation when capabilities arrive after the empty state', async () => {
    state.next({ ...snapshot, manifestAccepted: false });
    await select('ai');
    expect(page.sourceTiles).toHaveLength(0);
    state.next(snapshot);
    expect(page.sourceTiles).toHaveLength(2);
    await page.generate();
    expect(generate).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(page.canApply).toBe(true));
  });
  it('discards late generation results after leaving', async () => {
    await select('ai'); let finish!: (value: unknown) => void;
    generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    page.prompt = '做一个控制面板'; const task = page.generate(); page.ionViewDidLeave();
    finish({ tiles: [], summary: 'late' }); await task;
    expect(page.generated).toBe(false); expect(page.summary).toBe(''); expect(close).toHaveBeenCalled();
  });
  it('invalidates an AI draft when capabilities change', async () => {
    await select('ai'); page.prompt = '开关在上面'; await page.generate();
    state.next({ ...snapshot, manifestFingerprint: 'b'.repeat(64) }); expect(page.generated).toBe(false); expect(page.canApply).toBe(false);
  });
  it('opens the classic editor in edit mode without clearing its existing layout', async () => {
    await select('classic'); await page.apply(); expect(saveLayout).not.toHaveBeenCalled();
    expect(saveConfig).toHaveBeenCalledWith(device, { component: 'Layouter2Component' });
    expect(navigateRoot).toHaveBeenCalledWith('/device/device-1?edit=1'); expect(device.config.layouter).toBe('{"dashboard":[]}');
  });
  it('does not call cloud services for classic preview devices', async () => {
    device.config.isPreview = true; await select('classic'); await page.apply(); expect(saveConfig).not.toHaveBeenCalled();
  });
  it('does not allow shared devices to change configuration', async () => {
    device.config.isShared = true; await select('classic'); await page.apply(); expect(page.selected).toBeNull(); expect(saveConfig).not.toHaveBeenCalled();
  });
  it('generates from a selected style without requiring a custom prompt, then saves that style', async () => {
    await select('ai'); page.chooseStyle('technical');
    expect(page.density).toBe('compact');
    expect(page.tiles[0].type).toBe('value');
    await page.generate();
    expect(generate).toHaveBeenCalledWith(expect.stringContaining('深色科技'), 'compact', page.sourceTiles, 'technical', expect.objectContaining({ onPreview: expect.any(Function), signal: expect.any(AbortSignal) }));
    await page.apply();
    expect(saveLayout.mock.calls[0][1].style).toBe('technical');
  });
  it('invalidates the previous AI result on style change and protects a running generation', async () => {
    await select('ai'); await page.generate();
    page.chooseStyle('warm');
    expect(page.generated).toBe(false); expect(page.canApply).toBe(false); expect(page.summary).toBe('');
    expect(page.tiles.every(tile => tile.width === 8)).toBe(true);
    page.generating = true; page.chooseStyle('minimal'); expect(page.style).toBe('warm');
  });

  it('updates the canvas during generation, preserves layout on live state updates, and blocks partial apply', async () => {
    await select('ai');
    let finish!: (value: unknown) => void;
    generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = page.generate();
    const options = generate.mock.lastCall![4];
    const partial = { summary: '', tiles: [{ ...page.sourceTiles[1], title: 'AI 温度' }] };
    options.onPreview(partial);
    expect(page.generating).toBe(true); expect(page.previewCount).toBe(1);
    expect(page.tiles[0].title).toBe('AI 温度'); expect(page.canApply).toBe(false);
    state.next({ ...snapshot, endpoints: snapshot.endpoints.map(field => ({ ...field, value: field.id === 2 ? 28 : field.value })) });
    expect(page.tiles[0].title).toBe('AI 温度'); expect(page.tiles[0].value).toBe('28');
    finish(partial); await pending;
    expect(page.canApply).toBe(true); expect(page.tiles[0].value).toBe('28');
  });
  it('restores a successful draft on cancellation and ignores late stream callbacks', async () => {
    await select('ai'); await page.generate();
    const original = page.tiles;
    let finish!: (value: unknown) => void;
    generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = page.generate(); const options = generate.mock.lastCall![4];
    options.onPreview({ summary: '', tiles: [page.sourceTiles[1]] });
    page.cancelGeneration();
    expect(options.signal.aborted).toBe(true); expect(page.generated).toBe(true); expect(page.tiles).toEqual(original);
    options.onPreview({ summary: '', tiles: [] }); finish({ summary: 'late', tiles: [] }); await pending;
    expect(page.tiles).toEqual(original); expect(page.canApply).toBe(true);
  });
  it('restores the last complete draft after a partial stream fails and allows retry', async () => {
    await select('ai'); await page.generate(); const original = page.tiles;
    generate.mockImplementationOnce(async (...args) => { args[4].onPreview({ summary: '', tiles: [page.sourceTiles[1]] }); throw new Error('truncated'); });
    await page.generate();
    expect(page.tiles).toEqual(original); expect(page.generated).toBe(true); expect(page.error).toContain('未完成');
    await page.generate(); expect(page.error).toBe(''); expect(page.canApply).toBe(true);
  });
  it('aborts generation when the device manifest changes', async () => {
    await select('ai'); let finish!: (value: unknown) => void;
    generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = page.generate(); const options = generate.mock.lastCall![4];
    state.next({ ...snapshot, manifestFingerprint: 'c'.repeat(64) });
    expect(options.signal.aborted).toBe(true); expect(page.generating).toBe(false); expect(page.canApply).toBe(false);
    finish({ summary: 'late', tiles: [] }); await pending;
    expect(page.tiles).toHaveLength(2); expect(page.generated).toBe(false);
  });

  it('invalidates generation when manifest acceptance is revoked without changing its fingerprint', async () => {
    await select('ai'); await page.generate();
    state.next({ ...snapshot, manifestAccepted: false });
    expect(page.generated).toBe(false); expect(page.canApply).toBe(false); expect(page.tiles).toEqual([]);
  });

});
