import { ShareManagerPage } from './share-manager.page';
import { Subject } from 'rxjs';

describe('ShareManagerPage input and inventory', () => {
  function fixture() {
    const sharing = { acceptInvitation: vi.fn(), leaveShare: vi.fn(), listReceived: vi.fn().mockResolvedValue([]), listDevice: vi.fn(),
      listPendingInvitations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const data: any = { auth: { uuid: 'reader' }, sessionEpoch: 1, device: { list: [], dict: {} }, share: { byDevice: {}, received: [] },
      authDataChanged: new Subject<void>(), deviceDataLoader: new Subject<boolean>() };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    const notices = { showToast: vi.fn() };
    const alerts = { create: vi.fn().mockResolvedValue({ present: async () => {} }) };
    const invitation = { stage: vi.fn().mockReturnValue(true), stageDirected: vi.fn().mockReturnValue(true) };
    const nav = { navigateForward: vi.fn() };
    const page = new ShareManagerPage(sharing as any, data, users as any, alerts as any, notices as any, invitation as any, nav as any);
    return { page, sharing, data, alerts, invitation, nav, notices };
  }
  it('has two tabs and sends paste to the common confirmation page, never directly accepts', async () => {
    const f = fixture(); expect(f.page.shareTabs.map(tab => tab.label)).toEqual(['我分享的', '分享给我的']);
    await f.page.showAcceptInvitation();
    const confirm = f.alerts.create.mock.calls[0][0].buttons[1];
    confirm.handler({ code: 'diandeng://share/' + 'A'.repeat(43) });
    expect(f.invitation.stage).toHaveBeenCalledOnce();
    expect(f.nav.navigateForward).toHaveBeenCalledWith('/share-invitation');
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
