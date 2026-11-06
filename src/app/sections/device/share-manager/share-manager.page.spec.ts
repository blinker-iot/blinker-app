import { ShareManagerPage } from './share-manager.page';
import { BehaviorSubject, Subject } from 'rxjs';

describe('ShareManagerPage input and inventory', () => {
  function fixture() {
    const sharing = { acceptInvitation: vi.fn(), leaveShare: vi.fn(), listReceived: vi.fn().mockResolvedValue([]), listDevice: vi.fn(),
      listPendingInvitations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const data: any = { auth: { uuid: 'reader', accessToken: 'test-access' }, sessionEpoch: 1,
      device: { list: [], dict: {} }, share: { byDevice: {}, received: [] },
      authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(false) };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    const notices = { showToast: vi.fn() };
    const alerts = { create: vi.fn().mockResolvedValue({ present: async () => {} }) };
    const invitation = { stage: vi.fn().mockReturnValue(true), stageDirected: vi.fn().mockReturnValue(true), code: 'A'.repeat(43) };
    const nav = { navigateForward: vi.fn() };
    const bookmarks = { load: vi.fn(), remove: vi.fn() };
    const page = new ShareManagerPage(sharing as any, data, users as any, alerts as any, notices as any,
      invitation as any, nav as any, bookmarks as any, { markForCheck: vi.fn() } as any);
    return { page, sharing, data, alerts, invitation, nav, notices };
  }
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
  }
  it('DS-5 warm entry reads received, each owner and inbox once rather than treating the initial snapshot as a new load', async () => {
    const f = fixture(), received = deferred<any[]>(), owner = deferred<any>(), inbox = deferred<any>();
    f.data.device = { list: ['owned'], dict: { owned: { config: { isShared: false } } } };
    f.data.deviceDataLoader.next(true);
    f.sharing.listReceived.mockReturnValue(received.promise);
    f.sharing.listDevice.mockReturnValue(owner.promise);
    f.sharing.listPendingInvitations.mockReturnValue(inbox.promise);
    try {
      f.page.ngOnInit(); f.page.ionViewWillEnter();
      expect(f.sharing.listReceived).toHaveBeenCalledTimes(1);
      expect(f.sharing.listDevice).toHaveBeenCalledTimes(1);
      expect(f.sharing.listDevice).toHaveBeenCalledWith('owned');
      expect(f.sharing.listPendingInvitations).toHaveBeenCalledTimes(1);
      expect(f.sharing.acceptInvitation).not.toHaveBeenCalled(); expect(f.sharing.leaveShare).not.toHaveBeenCalled();
    } finally {
      received.resolve([]); owner.resolve({ logicalDeviceId: 'owned', shares: [], invitations: [] });
      inbox.resolve({ items: [], nextCursor: null }); await Promise.resolve(); await Promise.resolve();
      f.page.ngOnDestroy();
    }
  });
  it('DS-5 cold replay remains inert while later real loaded notifications still refresh', async () => {
    const f = fixture();
    try {
      f.page.ngOnInit(); expect(f.sharing.listReceived).not.toHaveBeenCalled();
      f.page.ionViewWillEnter(); await vi.waitFor(() => expect(f.page.loaded).toBe(true));
      expect(f.sharing.listReceived).toHaveBeenCalledTimes(1);
      f.data.deviceDataLoader.next(false); expect(f.sharing.listReceived).toHaveBeenCalledTimes(1);
      f.data.deviceDataLoader.next(true);
      expect(f.sharing.listReceived).toHaveBeenCalledTimes(2);
      await Promise.resolve(); await Promise.resolve();
      expect(f.sharing.listPendingInvitations).toHaveBeenCalledTimes(2);
      expect(f.sharing.acceptInvitation).not.toHaveBeenCalled(); expect(f.sharing.leaveShare).not.toHaveBeenCalled();
    } finally { f.page.ngOnDestroy(); }
  });
  it('DS-5 a failed warm read waits for explicit refresh rather than getting a second initial request', async () => {
    const f = fixture(); f.data.deviceDataLoader.next(true);
    f.sharing.listReceived.mockRejectedValueOnce(new Error('offline'));
    try {
      f.page.ngOnInit(); f.page.ionViewWillEnter(); await vi.waitFor(() => expect(f.page.loaded).toBe(true));
      expect(f.sharing.listReceived).toHaveBeenCalledTimes(1); expect(f.page.loadError).toContain('部分');
      await Promise.resolve(); await Promise.resolve(); expect(f.sharing.listReceived).toHaveBeenCalledTimes(1);
      await f.page.loadShares(); expect(f.sharing.listReceived).toHaveBeenCalledTimes(2); expect(f.page.loadError).toBe('');
      expect(f.sharing.acceptInvitation).not.toHaveBeenCalled(); expect(f.sharing.leaveShare).not.toHaveBeenCalled();
    } finally { f.page.ngOnDestroy(); }
  });
  it.each(['account', 'destroy'])('DS-5 retires the single warm read after %s without restoring stale owner or inbox state', async change => {
    const f = fixture(), received = deferred<any[]>(), owner = deferred<any>(), inbox = deferred<any>();
    f.data.device = { list: ['owned'], dict: { owned: { config: { isShared: false } } } };
    f.data.deviceDataLoader.next(true);
    f.sharing.listReceived.mockReturnValueOnce(received.promise);
    f.sharing.listDevice.mockReturnValue(owner.promise);
    f.sharing.listPendingInvitations.mockReturnValueOnce(inbox.promise);
    f.page.ngOnInit(); f.page.ionViewWillEnter();
    if (change === 'account') {
      f.data.auth = { uuid: 'next-owner', accessToken: 'next-test-access' };
      f.data.sessionEpoch++; f.data.device = { list: [], dict: {} }; f.data.authDataChanged.next();
    } else f.page.ngOnDestroy();
    received.resolve([]); owner.resolve({ logicalDeviceId: 'owned', shares: [], invitations: [] });
    inbox.resolve({ items: [], nextCursor: null });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(f.data.share.byDevice).toEqual({}); expect(f.page.pendingInvitations).toEqual([]);
    f.page.ngOnDestroy();
    const calls = f.sharing.listReceived.mock.calls.length;
    f.data.deviceDataLoader.next(true); f.data.authDataChanged.next();
    expect(f.sharing.listReceived).toHaveBeenCalledTimes(calls);
    expect(f.sharing.acceptInvitation).not.toHaveBeenCalled(); expect(f.sharing.leaveShare).not.toHaveBeenCalled();
  });
  it('keeps owner and received categories and sends paste to confirmation, never directly accepts', async () => {
    const f = fixture();
    expect(f.page.tab).toBe('sharing');
    f.page.changeTab('received');
    expect(f.page.tab).toBe('received');
    f.page.changeTab('sharing');
    expect(f.page.tab).toBe('sharing');
    f.page.changeTab('other');
    expect(f.page.tab).toBe('sharing');
    await f.page.showAcceptInvitation();
    const confirm = f.alerts.create.mock.calls[0][0].buttons[1];
    confirm.handler({ code: 'diandeng://share/' + 'A'.repeat(43) });
    expect(f.invitation.stage).toHaveBeenCalledOnce();
    expect(f.nav.navigateForward).toHaveBeenCalledWith(['/share-invitation', 'A'.repeat(43)]);
    expect(f.sharing.acceptInvitation).not.toHaveBeenCalled();
    f.invitation.stage.mockReturnValue(false); expect(confirm.handler({ code: 'bad' })).toBe(false);
    expect(f.nav.navigateForward).toHaveBeenCalledOnce();
  });
  it('keeps received devices usable when an owner inventory fails', async () => {
    const f = fixture(); f.data.device.list = ['own-device'];
    f.sharing.listDevice.mockRejectedValue(new Error('offline'));
    f.sharing.listReceived.mockResolvedValue([{ logicalDeviceId: 'shared' }]);
    await f.page.loadShares();
    expect(f.page.receivedDevices).toEqual([{ logicalDeviceId: 'shared' }]);
    expect(f.page.loadError).toContain('部分'); expect(f.page.loaded).toBe(true);
  });
  it('keeps owned devices separate from received shares with the new category controls', () => {
    const f = fixture();
    f.data.device = { list: ['owned', 'shared'], dict: {
      owned: { config: { isShared: false } }, shared: { config: { isShared: true } },
    } };
    f.data.share.received = [{ logicalDeviceId: 'shared' }];
    expect(f.page.shareableDeviceList).toEqual(['owned']);
    expect(f.page.receivedDevices).toEqual([{ logicalDeviceId: 'shared' }]);
  });
  it('cannot write old-account inventory back after an account change', async () => {
    const f = fixture(); let resolve!: (v: unknown) => void;
    f.sharing.listReceived.mockReturnValue(new Promise(done => { resolve = done; }));
    const task = f.page.loadShares(); f.data.sessionEpoch++;
    resolve([{ logicalDeviceId: 'old-account' }]); await task;
    expect(f.data.share.received).toEqual([]);
  });

  it('shows only real pending invitations, paginates and opens the common confirmation page', async () => {
    const f = fixture(), id = 'A'.repeat(22);
    f.sharing.listPendingInvitations.mockResolvedValueOnce({ items: [{ invitationId: id }] as any, nextCursor: id as any });
    await f.page.loadPendingInvitations(); expect(f.page.pendingInvitations).toHaveLength(1);
    expect(f.page.receivedDevices).toHaveLength(0);
    f.page.openPendingInvitation(id); expect(f.invitation.stageDirected).toHaveBeenCalledWith(id);
    expect(f.nav.navigateForward).toHaveBeenCalledWith('/share-invitation');
    expect(f.sharing.acceptInvitation).not.toHaveBeenCalled();
    f.sharing.listPendingInvitations.mockResolvedValueOnce({ items: [{ invitationId: 'other' }] as any, nextCursor: null });
    await f.page.loadPendingInvitations(true); expect(f.page.pendingInvitations).toHaveLength(2);
    expect(f.sharing.listPendingInvitations).toHaveBeenLastCalledWith(id);
  });

  it('isolates inbox failures and clears loaded and late old-account entries', async () => {
    const f = fixture(); f.page.ngOnInit();
    f.sharing.listPendingInvitations.mockRejectedValueOnce(new Error('offline'));
    await f.page.loadPendingInvitations(); expect(f.page.invitationError).toContain('暂未刷新');
    expect(f.page.loadError).toBe('');
    f.page.pendingInvitations = [{ invitationId: 'old' }] as any;
    let resolve!: (v: unknown) => void;
    f.sharing.listPendingInvitations.mockReturnValue(new Promise(done => { resolve = done; }));
    const task = f.page.loadPendingInvitations(); f.data.auth = null; f.data.sessionEpoch++; f.data.authDataChanged.next();
    expect(f.page.pendingInvitations).toEqual([]);
    resolve({ items: [{ invitationId: 'old' }], nextCursor: null }); await task;
    expect(f.page.pendingInvitations).toEqual([]); f.page.ngOnDestroy();
  });
});
