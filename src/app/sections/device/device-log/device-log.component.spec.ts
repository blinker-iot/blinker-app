import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { ActivityItem, ActivityPage, ActivityQuery, ACTIVITY_MAX_AGE_MS } from '../../../core/device-v2/device-activity';
import { BlinkerDevice } from '../../../core/model/device.model';
import { GatewayHttpError } from '../../../core/model/response.model';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ActivityService } from '../../../core/services/device-v2-activity.service';
import { DeviceLogComponent } from './device-log.component';

const ID = 'device_log_test';
function device(config: Partial<BlinkerDevice['config']> = {}, data: unknown = {}): BlinkerDevice {
  return { name: '客厅灯', deviceName: ID, config: { broker: '', customName: '', mode: 'bbp2', isShared: false, ...config },
    data, storage: {}, subject: new Subject() };
}
function row(id = '1', at = Date.now() - 1000, status: ActivityItem['status'] = 'acknowledged'): ActivityItem {
  return { id, endpointKey: 'power', status, attemptCount: 1, createdAt: at, updatedAt: at + 100 };
}
function result(query: ActivityQuery, items: ActivityItem[] = [], nextCursor: string | null = null): ActivityPage {
  return { logicalDeviceId: ID, from: query.from, to: query.to, items, nextCursor,
    retention: { maxAgeMs: ACTIVITY_MAX_AGE_MS }, timeBasis: 'serverRecordedAt', source: 'broker-command' };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

// Real production template; only the new read adapter and native visibility are
// controlled. No device connection, Manifest, State or request journal is faked.
async function render(options: { device?: BlinkerDevice | null; signedOut?: boolean; id?: string; active?: boolean;
  read?: (id: string, query: ActivityQuery, signal: AbortSignal) => Promise<ActivityPage> } = {}) {
  const item = options.device === undefined ? device() : options.device;
  const data = { auth: options.signedOut ? null : { uuid: 'owner' } as { uuid: string } | null,
    user: { id: 'stale-profile-owner' }, sessionEpoch: 1,
    authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(true),
    device: { dict: (item ? { [ID]: item } : {}) as Record<string, BlinkerDevice> },
    getDevice(id: string) { return this.device.dict[id]; } };
  const route = { id: options.id === undefined ? ID : options.id };
  const navigation = { navigateForward: vi.fn().mockResolvedValue(true) };
  const activity = { read: vi.fn(options.read ?? ((_id, query) => Promise.resolve(result(query)))) };
  const visibility = { active: new BehaviorSubject(options.active !== false) };
  await TestBed.configureTestingModule({ imports: [DeviceLogComponent], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => route.id } } } },
    { provide: DataService, useValue: data }, { provide: NavController, useValue: navigation },
    { provide: DeviceV2ActivityService, useValue: activity }, { provide: AppVisibilityService, useValue: visibility },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(DeviceLogComponent), page = fixture.componentInstance;
  fixture.autoDetectChanges(); page.ionViewWillEnter(); await fixture.whenStable();
  return { fixture, page, element: fixture.nativeElement as HTMLElement, data, route, navigation, activity, visibility,
    settle: async () => { await Promise.resolve(); await fixture.whenStable(); } };
}

describe('Device activity production template and bounded lifecycle', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('reads once on owned foreground entry and shows exact statuses without claiming physical execution', async () => {
    const statuses: ActivityItem['status'][] = ['inflight', 'acknowledged', 'rejected', 'outcome_unknown', 'not_sent'];
    const f = await render({ read: async (_id, q) => result(q, statuses.map((s, i) => row(String(5 - i), q.to - 1000, s))) });
    expect(f.activity.read).toHaveBeenCalledTimes(1); expect(f.element.querySelector('ion-title')?.textContent).toBe('活动记录');
    const [id, q, signal] = f.activity.read.mock.calls[0];
    expect(id).toBe(ID); expect(q.limit).toBe(20); expect(q.to - q.from).toBe(ACTIVITY_MAX_AGE_MS); expect(signal.aborted).toBe(false);
    expect(f.element.querySelectorAll('.activity-row')).toHaveLength(5);
    expect([...f.element.querySelectorAll('.activity-status')].map(e => e.textContent)).toEqual(['处理中', '设备已确认', '请求被拒绝', '结果未知', '未下发']);
    expect(f.element.textContent).toContain('操作者未记录'); expect(f.element.textContent).toContain('不等于新鲜 State 或物理执行完成');
    expect(f.element.querySelector('details')?.open).toBe(false);
    expect(f.element.textContent).not.toMatch(/0 次执行|执行成功|原始请求|idempotency/);
    expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });
  it('never accesses plausible or malformed legacy log arrays', async () => {
    const legacy = {};
    for (const key of ['runtimeLogs', 'logs', 'log']) Object.defineProperty(legacy, key, { get: () => { throw Error('private legacy data accessed'); } });
    const f = await render({ device: device({}, legacy) });
    expect(f.element.querySelector('.empty-state')?.textContent).toContain('暂无可显示的活动记录');
    expect(f.element.textContent).not.toContain('执行次数'); expect(f.element.querySelectorAll('time')).toHaveLength(0);
  });
  it('only navigates to State history or trends after explicit user action', async () => {
    const f = await render(); expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    f.element.querySelector<HTMLButtonElement>('[data-history="storage"]')!.click();
    f.element.querySelector<HTMLButtonElement>('[data-history="trends"]')!.click();
    expect(f.navigation.navigateForward.mock.calls.map(call => call[0])).toEqual([`/device-manager/${ID}/storage`, `/device-manager/${ID}/trends`]);
    expect(f.activity.read).toHaveBeenCalledTimes(1);
  });
  it.each([true, undefined])('does not request records for shared or unconfirmed ownership (%s)', async isShared => {
    const f = await render({ device: device({ isShared }) });
    expect(f.activity.read).not.toHaveBeenCalled(); expect(f.element.querySelectorAll('.activity-row, [data-action]')).toHaveLength(0);
    expect(f.element.querySelector('h1')?.textContent).toContain(isShared ? '分享用户' : '所有者权限尚未确认');
    expect(f.element.querySelector('[data-history="storage"]')).not.toBeNull();
    await f.page.refresh(); await f.page.loadMore(); expect(f.activity.read).not.toHaveBeenCalled();
  });
  it.each([
    ['missing', null, '设备不存在或当前不可用'], ['disabled', device({ disabled: true }), '设备不存在或当前不可用'],
    ['preview', device({ isPreview: true }), '预览设备没有活动记录'], ['legacy', device({ mode: 'mqtt' }), '当前设备暂不支持此入口'],
    ...['deleted', 'retired', 'pending'].map(state => [state, Object.assign(device(), { state }), '设备不存在或当前不可用'] as const),
  ] as const)('refuses an invalid device context (%s) without any request', async (_kind, item, title) => {
    const f = await render({ device: item as BlinkerDevice });
    expect(f.element.querySelector('h1')?.textContent).toBe(title); expect(f.activity.read).not.toHaveBeenCalled();
    f.page.openHistory('storage'); expect(f.navigation.navigateForward).not.toHaveBeenCalled();
  });
  it('requires restored auth and an actual route ID rather than stale profile data', async () => {
    const f = await render({ signedOut: true });
    expect(f.element.querySelector('h1')?.textContent).toBe('请先登录当前账号'); expect(f.activity.read).not.toHaveBeenCalled();
    f.page.ionViewWillLeave(); f.data.auth = { uuid: 'owner' }; f.route.id = ''; f.page.ionViewWillEnter(); await f.settle();
    expect(f.element.querySelector('h1')?.textContent).toBe('设备不存在或当前不可用'); expect(f.activity.read).not.toHaveBeenCalled();
  });
  it('does not fetch on ordinary token/inventory notifications or unchanged foreground events', async () => {
    const f = await render();
    f.data.auth = { uuid: 'owner' }; f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true); f.data.deviceDataLoader.next(true);
    f.visibility.active.next(true); await f.settle(); expect(f.activity.read).toHaveBeenCalledTimes(1);
    f.element.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click(); await f.settle();
    expect(f.activity.read).toHaveBeenCalledTimes(2);
  });
  it('uses current compatible display metadata while retaining exact historical keys and no invented actor/value', async () => {
    const item = device(); item.displayMetadata = { logicalDeviceId: ID, revision: 1, name: '客厅', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源开关' }] };
    const f = await render({ device: item, read: async (_id, q) => result(q, [row('2', q.to - 1000), { ...row('1', q.to - 2000), endpointKey: 'removed' }]) });
    expect(f.element.querySelector('.activity-heading h1')?.textContent).toBe('客厅');
    expect([...f.element.querySelectorAll('.row-heading h2')].map(e => e.textContent)).toEqual(['电源开关', 'removed']);
    expect(f.element.querySelector('.endpoint-key')?.textContent).toBe('power'); expect(f.activity.read).toHaveBeenCalledTimes(1);
    expect(f.element.textContent).not.toMatch(/打开|关闭|所有者操作|自动化操作/);
  });
  it('cancels and clears immediately in background, ignores late completion, and reads fresh once on return', async () => {
    const pending = deferred<ActivityPage>(); const f = await render({ read: () => pending.promise });
    const [, query, signal] = f.activity.read.mock.calls[0];
    f.visibility.active.next(false); expect(signal.aborted).toBe(true); expect(f.page.state().rows).toEqual([]);
    pending.resolve(result(query, [row()])); await f.settle(); expect(f.element.querySelector('.activity-row')).toBeNull();
    f.activity.read.mockImplementation(async (_id, q) => result(q, [row('2', q.to - 1000)]));
    f.visibility.active.next(true); await f.settle(); expect(f.activity.read).toHaveBeenCalledTimes(2);
    expect(f.page.state().rows[0].id).toBe('2');
    f.visibility.active.next(true); await f.settle(); expect(f.activity.read).toHaveBeenCalledTimes(2);
  });
  it('defers initial read while hidden and does not revive a left cached page on foreground', async () => {
    const f = await render({ active: false }); expect(f.activity.read).not.toHaveBeenCalled();
    f.visibility.active.next(true); await f.settle(); expect(f.activity.read).toHaveBeenCalledTimes(1);
    f.page.ionViewWillLeave(); f.visibility.active.next(false); f.visibility.active.next(true); await f.settle();
    expect(f.activity.read).toHaveBeenCalledTimes(1); expect(f.page.state().rows).toEqual([]);
  });
  it.each(['account', 'signout', 'authority', 'deleted', 'disabled', 'shared'])('aborts and clears on %s and rejects stale UI actions and late replies', async reason => {
    const pending = deferred<ActivityPage>(); const f = await render({ read: () => pending.promise });
    const [, query, signal] = f.activity.read.mock.calls[0], authority = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;
    try {
      if (reason === 'account') { f.data.auth = { uuid: 'other' }; f.data.sessionEpoch++; }
      if (reason === 'signout') { f.data.auth = null; f.data.sessionEpoch++; }
      if (reason === 'authority') Object.defineProperty(API, 'BASE_URL', { ...authority, value: 'https://other.invalid' });
      if (reason === 'deleted') delete f.data.device.dict[ID];
      if (reason === 'disabled') f.data.device.dict[ID].config.disabled = true;
      if (reason === 'shared') f.data.device.dict[ID].config.isShared = true;
      f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true); expect(signal.aborted).toBe(true);
      pending.resolve(result(query, [row()])); await f.settle();
      expect(f.page.state().rows).toEqual([]); expect(f.element.querySelector('.activity-row')).toBeNull();
      await f.page.refresh(); await f.page.loadMore(); f.page.openHistory('storage');
      expect(f.activity.read).toHaveBeenCalledTimes(1);
      if (reason !== 'shared') expect(f.navigation.navigateForward).not.toHaveBeenCalled();
    } finally { Object.defineProperty(API, 'BASE_URL', authority); }
  });
  it('checks current inventory even before its notification when processing a reply', async () => {
    const pending = deferred<ActivityPage>(), f = await render({ read: () => pending.promise });
    const query = f.activity.read.mock.calls[0][1]; f.data.device.dict[ID].config.isShared = true;
    pending.resolve(result(query, [row()])); await f.settle();
    expect(f.page.state().rows).toEqual([]); expect(f.page.status()).toBe('shared');
  });
  it('freezes the initial window and appends only strictly older timestamp/ID tuples', async () => {
    const f = await render({ read: async (_id, q) => result(q, [row('2', q.to - 1000)], 'YWJj') });
    const first = f.activity.read.mock.calls[0][1];
    f.activity.read.mockImplementation(async (_id, q) => result(q, [row('100', q.to - 2000)], null));
    await f.page.loadMore(); await f.settle();
    expect(f.activity.read.mock.calls[1][1]).toEqual({ ...first, before: 'YWJj' });
    expect(f.page.state().rows.map(r => r.id)).toEqual(['2', '100']);
  });
  it.each(['duplicate', 'newer', 'equal-tuple'])('rejects malformed cross-page %s without displaying a partial merge', async reason => {
    const at = Date.now() - 1000;
    const f = await render({ read: async (_id, q) => result(q, [row('2', at)], 'YWJj') });
    f.activity.read.mockImplementation(async (_id, q) => result(q, [row(reason === 'newer' ? '1' : '2', reason === 'newer' ? at + 1 : at)], null));
    await f.page.loadMore(); await f.settle();
    expect(f.page.state().rows).toEqual([]); expect(f.page.state().ready).toBe(false);
    expect(f.element.querySelector('.read-error')?.textContent).toContain('未取得有效'); expect(f.activity.read).toHaveBeenCalledTimes(2);
  });
  it('retains nextCursor at the 200-row view bound but disables further reads', async () => {
    let pageIndex = 0;
    const f = await render({ read: async (_id, q) => {
      const start = pageIndex++ * 20;
      return result(q, Array.from({ length: 20 }, (_, offset) => row(String(1000 - start - offset), q.to - 1000 - start - offset)), btoa(String(pageIndex)).replace(/=+$/, ''));
    } });
    for (let i = 0; i < 9; i++) await f.page.loadMore();
    await f.settle(); expect(f.page.state().rows).toHaveLength(200); expect(f.page.state().nextCursor).toBe('MTA');
    expect(f.page.bounded).toBe(true); expect(f.element.querySelector<HTMLButtonElement>('[data-action="more"]')?.disabled).toBe(true);
    await f.page.loadMore(); expect(f.activity.read).toHaveBeenCalledTimes(10);
  });
  it.each([[401, '请重新登录'], [403, '访问权限已变化'], [404, '服务暂不可用'], [503, '服务暂不可用'], [400, '手动刷新']])('renders HTTP %s as a failure without empty-success or retry', async (status, expected) => {
    const error = new GatewayHttpError({ httpStatus: Number(status), code: 'ACTIVITY_TEST', message: 'PRIVATE_RAW_ERROR' });
    const f = await render({ read: async () => { throw error; } });
    expect(f.element.textContent).toContain(String(expected)); expect(f.element.textContent).not.toContain('PRIVATE_RAW_ERROR');
    expect(f.element.querySelector('.empty-state')).toBeNull();
    f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true); await f.settle();
    expect(f.activity.read).toHaveBeenCalledTimes(1);
    if (status === 403) { await f.page.refresh(); expect(f.activity.read).toHaveBeenCalledTimes(1); }
  });
  it('only retries a failed read after an explicit refresh and never exposes replay controls', async () => {
    const f = await render({ read: async () => { throw Error('private request data'); } });
    expect(f.element.querySelectorAll('[data-action]')).toHaveLength(1); expect(f.element.textContent).not.toContain('private request data');
    f.activity.read.mockImplementation(async (_id, q) => result(q));
    f.element.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click(); await f.settle();
    expect(f.activity.read).toHaveBeenCalledTimes(2); expect(f.element.querySelector('.empty-state')).not.toBeNull();
  });
  describe('manual recovery gate across visibility changes', () => {
    it.each([401, 400, 404, 429, 503])('does not retry HTTP %s after repeated background returns or notifications', async httpStatus => {
      const f = await render({ read: async () => { throw new GatewayHttpError({ httpStatus, code: 'TEST', message: 'PRIVATE_HTTP_DATA' }); } });
      const error = f.page.state().error;
      expect(error).not.toBe('');
      for (let i = 0; i < 2; i++) {
        f.visibility.active.next(false); await f.settle();
        expect(f.page.deviceName()).toBe('');
        expect(f.page.state()).toEqual({ busy: false, ready: false, error, rows: [], from: 0, to: 0, nextCursor: null });
        expect(f.element.querySelectorAll('.activity-row, .read-error')).toHaveLength(0);
        f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true);
        f.visibility.active.next(true); f.visibility.active.next(true); await f.settle();
        expect(f.activity.read).toHaveBeenCalledTimes(1);
        expect(f.element.querySelector('[role="alert"]')?.textContent).toBe(error);
        expect(f.element.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.disabled).toBe(false);
        expect(f.element.textContent).not.toContain('PRIVATE_HTTP_DATA');
      }
    });
    it.each(['invalid-response', 'timeout'])('does not retry an adapter %s failure on foreground return', async kind => {
      const error = kind === 'timeout' ? Object.assign(Error('PRIVATE_TIMEOUT'), { name: 'TimeoutError' }) : Error('DEVICE_V2_ACTIVITY_RESPONSE_INVALID');
      const f = await render({ read: async () => { throw error; } });
      f.visibility.active.next(false); f.visibility.active.next(true); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(1);
      expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('手动刷新');
      expect(f.element.querySelector('.empty-state')).toBeNull();
      expect(f.element.textContent).not.toContain('PRIVATE_TIMEOUT');
    });
    it.each(['cursor-http', 'invalid-merge'])('does not restart a failed %s pagination read on return', async kind => {
      const f = await render({ read: async (_id, q) => result(q, [row('2', q.to - 1000)], 'YWJj') });
      const first = f.activity.read.mock.calls[0][1];
      f.activity.read.mockImplementation(async (_id, q) => {
        if (kind === 'cursor-http') throw new GatewayHttpError({ httpStatus: 400, code: 'TEST', message: 'PRIVATE_CURSOR' });
        return result(q, [row('2', first.to - 1000)]);
      });
      f.element.querySelector<HTMLButtonElement>('[data-action="more"]')!.click(); await f.settle();
      const error = f.page.state().error; expect(error).not.toBe('');
      f.visibility.active.next(false); f.visibility.active.next(true); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(2); expect(f.page.state().rows).toEqual([]);
      expect(f.page.state().nextCursor).toBeNull(); expect(f.page.state().from).toBe(0); expect(f.page.state().to).toBe(0);
      expect(f.element.querySelector('[role="alert"]')?.textContent).toBe(error);
      expect(f.element.querySelector('[data-action="more"]')).toBeNull();
    });
    it('retains a failed read across background and foreground until explicit refresh', async () => {
      const f = await render({ read: async () => { throw new GatewayHttpError({ httpStatus: 503, code: 'TEST', message: 'PRIVATE_ERROR' }); } });
      const error = f.page.state().error;
      f.visibility.active.next(false); await f.settle();
      expect(f.page.state().rows).toEqual([]); expect(f.page.deviceName()).toBe('');
      expect(f.element.querySelector('.read-error')).toBeNull();
      f.visibility.active.next(true); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(1);
      expect(f.page.state().error).toBe(error);
      expect(f.element.querySelector('[role="alert"]')?.textContent).toBe(error);
      expect(f.element.querySelector('.empty-state')).toBeNull();
      expect(f.element.textContent).not.toContain('PRIVATE_ERROR');
      f.activity.read.mockImplementation(async (_id, q) => result(q));
      f.element.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click(); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(2); expect(f.page.state().error).toBe('');
      f.visibility.active.next(false); f.visibility.active.next(true); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(3); expect(f.page.state().ready).toBe(true);
    });
    it('clears the recovery prompt only on explicit reentry and then reads the new page context', async () => {
      const f = await render({ read: async () => { throw Error('PRIVATE_OLD_READ'); } });
      f.visibility.active.next(false); f.visibility.active.next(true); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(1);
      f.page.ionViewWillLeave(); await f.settle();
      expect(f.page.state().error).toBe(''); expect(f.page.deviceName()).toBe('');
      f.route.id = 'device_new_context'; f.data.device.dict['device_new_context'] = { ...device(), name: '书房灯' };
      f.activity.read.mockImplementation(async (id, q) => ({ ...result(q), logicalDeviceId: id }));
      f.page.ionViewWillEnter(); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(2); expect(f.activity.read.mock.calls[1][0]).toBe('device_new_context');
      expect(f.element.querySelector('.activity-heading h1')?.textContent).toBe('书房灯');
      expect(f.page.state().error).toBe(''); expect(f.page.state().ready).toBe(true);
    });
    it.each(['account', 'authority', 'shared'])('does not revive the recovery prompt or query after %s loss while hidden', async reason => {
      const f = await render({ read: async () => { throw Error('PRIVATE_OLD_CONTEXT'); } });
      const authority = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;
      try {
        f.visibility.active.next(false);
        if (reason === 'account') { f.data.auth = { uuid: 'other' }; f.data.sessionEpoch++; }
        if (reason === 'authority') Object.defineProperty(API, 'BASE_URL', { ...authority, value: 'https://other.invalid' });
        if (reason === 'shared') f.data.device.dict[ID].config.isShared = true;
        f.data.authDataChanged.next(); f.data.deviceDataLoader.next(true);
        f.visibility.active.next(true); await f.settle();
        expect(f.activity.read).toHaveBeenCalledTimes(1); expect(f.page.state().error).toBe('');
        expect(f.page.deviceName()).toBe(''); expect(f.element.querySelectorAll('.read-error, .activity-row, [data-action]')).toHaveLength(0);
        await f.page.refresh(); expect(f.activity.read).toHaveBeenCalledTimes(1);
      } finally { Object.defineProperty(API, 'BASE_URL', authority); }
    });
    it('keeps normal cancellation recovery after an explicit refresh and ignores its late failure', async () => {
      const f = await render({ read: async () => { throw Error('PRIVATE_INITIAL'); } });
      let reject!: (error: Error) => void;
      const pending = new Promise<ActivityPage>((_resolve, no) => { reject = no; });
      f.activity.read.mockImplementation(() => pending);
      f.element.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click(); await Promise.resolve();
      expect(f.activity.read).toHaveBeenCalledTimes(2);
      const signal = f.activity.read.mock.calls[1][2];
      f.visibility.active.next(false); expect(signal.aborted).toBe(true);
      reject(Error('PRIVATE_LATE_FAILURE')); await f.settle();
      expect(f.page.state().error).toBe('');
      f.activity.read.mockImplementation(async (_id, q) => result(q));
      f.visibility.active.next(true); await f.settle();
      expect(f.activity.read).toHaveBeenCalledTimes(3); expect(f.page.state().ready).toBe(true);
      expect(f.element.querySelector('.read-error')).toBeNull();
    });
  });
  it('captures a different route only on explicit reentry and isolates the previous request', async () => {
    const pending = deferred<ActivityPage>(), f = await render({ read: () => pending.promise });
    const [, query, signal] = f.activity.read.mock.calls[0]; f.page.ionViewWillLeave(); expect(signal.aborted).toBe(true);
    f.route.id = 'device_other'; f.data.device.dict['device_other'] = { ...device(), name: '书房灯' };
    f.activity.read.mockImplementation(async (_id, q) => ({ ...result(q), logicalDeviceId: 'device_other' }));
    f.page.ionViewWillEnter(); await f.settle(); pending.resolve(result(query, [row()])); await f.settle();
    expect(f.element.querySelector('.activity-heading h1')?.textContent).toBe('书房灯'); expect(f.page.state().rows).toEqual([]);
  });
  it('unsubscribes, aborts, clears and cannot restart after destruction', async () => {
    const pending = deferred<ActivityPage>(), f = await render({ read: () => pending.promise });
    const [, query, signal] = f.activity.read.mock.calls[0]; f.fixture.destroy();
    expect(signal.aborted).toBe(true); expect(f.data.authDataChanged.observers).toHaveLength(0);
    expect(f.data.deviceDataLoader.observers).toHaveLength(0); expect(f.visibility.active.observers).toHaveLength(0);
    pending.resolve(result(query, [row()])); await Promise.resolve();
    f.page.ionViewWillEnter(); f.page.openHistory('storage'); await f.page.refresh();
    expect(f.page.state().rows).toEqual([]); expect(f.activity.read).toHaveBeenCalledTimes(1);
  });
});
