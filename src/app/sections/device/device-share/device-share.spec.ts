import { DeviceSharePage } from './device-share';

describe('DeviceSharePage sharing contract', () => {
  function fixture() {
    const data = { share: { byDevice: {} }, sessionEpoch: 1 };
    const sharing = { createInvitation: vi.fn(), revokeInvitation: vi.fn(), updateShare: vi.fn(), revokeShare: vi.fn(),
      listDevice: vi.fn().mockResolvedValue({ logicalDeviceId: 'device-one', shares: [], invitations: [] }) };
    const alerts = { create: vi.fn().mockResolvedValue({ present: async () => {} }) };
    const notices = { showToast: vi.fn() };
    const page = new DeviceSharePage({} as any, data as any, sharing as any,
      { canManagePresenceCredential: async () => false } as any, alerts as any, notices as any,
      {} as any, { sessionVersion: 1 } as any, { markForCheck: vi.fn() } as any);
    page.id = 'device-one';
    return { page, sharing, alerts, notices, data };
  }

  it('defaults invitations to view-only and lets the server own quotas', async () => {
    const f = fixture();
    vi.spyOn(f.page, 'sharedUserCount', 'get').mockReturnValue(10);
    await f.page.addShare();
    expect(f.page.permissionsOpen).toBe(true);
    expect(f.page.permissionRole).toBe('viewer');
    expect(f.page.permissionEdit).toBe(false);
  });

  it('reuses the invitation operation key after a lost response', async () => {
    const f = fixture();
    f.sharing.createInvitation.mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ invitationCode: 'A'.repeat(43) });
    await (f.page as any).createInvitation('viewer');
    await (f.page as any).createInvitation('viewer');
    expect(f.sharing.createInvitation.mock.calls[0][2]).toBe(f.sharing.createInvitation.mock.calls[1][2]);
  });

  it('creates a directed invitation without a bearer link or a false notification success', async () => {
    const f = fixture(); f.sharing.createInvitation.mockResolvedValue({ targeted: true });
    await f.page.addShare('reader@example.com');
    expect(f.page.permissionRole).toBe('viewer');
    expect(f.page.permissionEdit).toBe(false);
    await (f.page as any).createInvitation('viewer', 'reader@example.com');
    expect(f.sharing.createInvitation).toHaveBeenCalledWith('device-one', 'viewer', expect.any(String), undefined, 'reader@example.com', false);
    expect(f.alerts.create).not.toHaveBeenCalled();
    expect(f.notices.showToast).toHaveBeenCalledWith(expect.stringContaining('系统通知尚未接通'));
  });

  it('keeps retry keys scoped to recipient, role, account session and device', async () => {
    const f = fixture(); f.sharing.createInvitation.mockRejectedValue(new Error('timeout'));
    const create = (email: string) => (f.page as any).createInvitation('viewer', email);
    await create('one@example.com'); await create('one@example.com'); await create('two@example.com');
    f.data.sessionEpoch++; await create('two@example.com');
    f.page.id = 'another-device'; await create('two@example.com');
    const keys = f.sharing.createInvitation.mock.calls.map(call => call[2]);
    expect(keys[0]).toBe(keys[1]); expect(new Set(keys.slice(1)).size).toBe(4);
  });

  it('discards late invitation/directory responses after account switch or page disposal', async () => {
    for (const destroy of [false, true]) {
      const f = fixture(); let resolve!: (value: any) => void;
      f.sharing.createInvitation.mockReturnValue(new Promise(done => { resolve = done; }));
      const pending = (f.page as any).createInvitation('viewer', 'reader@example.com');
      if (destroy) f.page.ngOnDestroy(); else f.data.sessionEpoch++;
      resolve({ targeted: true }); await pending;
      expect(f.sharing.listDevice).not.toHaveBeenCalled();
      expect(f.notices.showToast).not.toHaveBeenCalled(); expect(f.alerts.create).not.toHaveBeenCalled();
    }
  });

  it('keeps a failed directed operation directed; never silently creates an open link', async () => {
    const f = fixture();
    f.sharing.createInvitation.mockRejectedValue({ error: { errorCode: 'DEVICE_V2_SHARE_DIRECTORY_UNAVAILABLE' } });
    await (f.page as any).createInvitation('viewer', 'reader@example.com');
    expect(f.sharing.createInvitation).toHaveBeenCalledTimes(1);
    expect(f.sharing.createInvitation.mock.calls[0][4]).toBe('reader@example.com');
    expect(f.notices.showToast).toHaveBeenCalledWith(expect.stringContaining('邮箱邀请服务暂不可用'));
  });

  it('distinguishes cancelling a consumed invitation from removing its member', async () => {
    const f = fixture(); f.sharing.revokeInvitation.mockResolvedValue({ state: 'accepted' });
    await f.page.cancelInvitation('invite');
    expect(f.notices.showToast).toHaveBeenCalledWith('邀请已被领取，请在共享成员中解除分享');
    expect(f.sharing.revokeShare).not.toHaveBeenCalled();
  });

  it('does not report pending Broker delivery or offline local retirement as complete', async () => {
    const f = fixture(); f.sharing.updateShare.mockResolvedValue({ realtimeRefreshPending: true });
    f.page.editPermissions({ shareId: 'share', role: 'operator', commandEndpointKeys: null } as any);
    f.page.permissionRole = 'viewer';
    await f.page.savePermissions();
    expect(f.notices.showToast).toHaveBeenCalledWith('权限已保存，通信权限同步中');
    f.sharing.revokeShare.mockResolvedValue({ realtimeRefreshPending: false });
    await f.page.removeShare('share');
    expect(f.notices.showToast).toHaveBeenLastCalledWith(expect.stringContaining('离线本地凭据'));
  });

  it('keeps console editing independent of control for directed and open invitations', async () => {
    const f = fixture();
    f.sharing.createInvitation.mockResolvedValue({ targeted: true });
    await f.page.addShare('reader@example.com');
    f.page.permissionEdit = true;
    await f.page.savePermissions();
    expect(f.sharing.createInvitation).toHaveBeenLastCalledWith(
      'device-one', 'viewer', expect.any(String), undefined, 'reader@example.com', true);
    expect(f.page.invitationDetails).toBeNull();

    f.sharing.createInvitation.mockResolvedValue({ invitationCode: 'A'.repeat(43) });
    await f.page.addShare();
    expect(f.page.permissionEdit).toBe(false);
    await f.page.savePermissions();
    expect(f.sharing.createInvitation).toHaveBeenLastCalledWith(
      'device-one', 'viewer', expect.any(String), undefined, undefined, false);
    expect(f.page.invitationLink).toContain('A'.repeat(43));
  });
});
