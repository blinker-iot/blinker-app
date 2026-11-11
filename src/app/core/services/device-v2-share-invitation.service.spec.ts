import { Subject } from 'rxjs';
import { DeviceV2ShareInvitationService } from './device-v2-share-invitation.service';

const previewFixture = {
  invitationId: 'invitation', logicalDeviceId: 'device-one', deviceName: 'Lamp', deviceType: 'diy',
  state: 'pending', role: 'viewer', commandEndpointKeys: null, expiresAt: 9999999999999, currentShare: null,
};

describe('one share invitation flow', () => {
  function fixture(loggedIn = true) {
    const data: any = { auth: loggedIn ? { uuid: 'reader' } : null, sessionEpoch: 1, authDataChanged: new Subject<void>() };
    const api = { previewInvitation: vi.fn().mockResolvedValue(previewFixture), acceptInvitation: vi.fn(), declineInvitation: vi.fn() };
    const flow = new DeviceV2ShareInvitationService(data, api as any);
    const changeAccount = (id: string | null) => {
      data.auth = id ? { uuid: id } : null; data.sessionEpoch++; data.authDataChanged.next();
    };
    return { data, api, flow, changeAccount };
  }
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

  it('pasting previews only; acceptance requires explicit confirmation and drops the proof', async () => {
    const f = fixture();
    expect(f.flow.stage('diandeng://share/' + 'A'.repeat(43))).toBe(true); await tick();
    expect(f.api.acceptInvitation).not.toHaveBeenCalled(); expect(f.flow.state().phase).toBe('preview');
    f.api.acceptInvitation.mockResolvedValue({ logicalDeviceId: 'device-one', share: { state: 'active' }, realtimeRefreshPending: true });
    await f.flow.accept();
    expect(f.flow.state()).toMatchObject({ phase: 'accepted', result: { realtimeRefreshPending: true } });
    expect(f.flow.hasPending).toBe(false);
    await f.flow.accept(); expect(f.api.acceptInvitation).toHaveBeenCalledOnce();
  });
  it('preserves anonymous input across login without auto-accept and clears on logout/switch', async () => {
    const f = fixture(false); f.flow.stage('A'.repeat(43));
    expect(f.flow.state().phase).toBe('login'); expect(f.api.previewInvitation).not.toHaveBeenCalled();
    f.changeAccount('reader'); expect(f.flow.hasPending).toBe(true);
    await f.flow.refresh(); expect(f.flow.state().phase).toBe('preview');
    expect(f.api.acceptInvitation).not.toHaveBeenCalled();
    f.changeAccount('other'); expect(f.flow.hasPending).toBe(false); expect(f.flow.state().phase).toBe('empty');
    f.flow.stage('A'.repeat(43)); f.changeAccount(null); await tick();
    expect(f.flow.state().phase).toBe('empty');
  });

  it('inbox and future notification IDs enter the same preview flow, never auto-accept', async () => {
    const f = fixture(false), id = 'A'.repeat(22);
    expect(f.flow.stageDirected('not-an-id')).toBe(false);
    expect(f.flow.stageDirected(id)).toBe(true); expect(f.flow.state().phase).toBe('login');
    f.changeAccount('reader'); await f.flow.refresh();
    expect(f.api.previewInvitation).toHaveBeenCalledWith({ invitationId: id });
    expect(f.api.acceptInvitation).not.toHaveBeenCalled();
    f.api.acceptInvitation.mockResolvedValue({ logicalDeviceId: 'device-one', share: { state: 'active' } });
    await f.flow.accept(); expect(f.api.acceptInvitation).toHaveBeenCalledWith({ invitationId: id });
    expect(f.flow.hasPending).toBe(false);
  });

  it('only a confirmed target preview can be declined; simultaneous accept/decline cannot both send', async () => {
    const f = fixture(), id = 'A'.repeat(22);
    f.flow.stage('A'.repeat(43)); await tick(); await f.flow.decline();
    expect(f.api.declineInvitation).not.toHaveBeenCalled();
    f.api.previewInvitation.mockResolvedValue({ ...previewFixture, invitationId: id, targeted: true });
    f.flow.stageDirected(id); await tick();
    let resolve!: (v: unknown) => void;
    f.api.declineInvitation.mockReturnValue(new Promise(done => { resolve = done; }));
    const task = f.flow.decline(); await f.flow.decline(); await f.flow.accept();
    expect(f.api.acceptInvitation).not.toHaveBeenCalled(); expect(f.api.declineInvitation).toHaveBeenCalledOnce();
    resolve({ state: 'declined' }); await task;
    expect(f.flow.state().phase).toBe('declined'); expect(f.flow.hasPending).toBe(false);
  });

  it('ignores late decline after account change and allows an explicit recheck after a failed decline', async () => {
    const f = fixture(), id = 'A'.repeat(22);
    f.api.previewInvitation.mockResolvedValue({ ...previewFixture, invitationId: id, targeted: true });
    f.flow.stageDirected(id); await tick();
    f.api.declineInvitation.mockRejectedValueOnce(new Error('offline'));
    await f.flow.decline(); expect(f.flow.state().phase).toBe('error'); expect(f.flow.hasPending).toBe(true);
    await f.flow.refresh();
    let resolve!: (v: unknown) => void;
    f.api.declineInvitation.mockReturnValue(new Promise(done => { resolve = done; }));
    const task = f.flow.decline(); f.changeAccount('other'); resolve({ state: 'declined' }); await task;
    expect(f.flow.state().phase).toBe('empty');
  });
  it('ignores late preview and accept responses after input/account changes', async () => {
    const f = fixture(); let resolve!: (v: unknown) => void;
    f.api.previewInvitation.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    f.flow.stage('A'.repeat(43)); f.flow.stage('B'.repeat(42) + 'A'); await tick();
    resolve({ ...previewFixture, deviceName: 'obsolete' }); await tick();
    expect(f.flow.state().preview?.deviceName).toBe('Lamp');
    f.api.acceptInvitation.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const request = f.flow.accept(); f.changeAccount('other');
    resolve({ logicalDeviceId: 'device-one', share: { state: 'active' } }); await request;
    expect(f.flow.state().phase).toBe('empty');
  });
  it('coalesces repeated input and accept clicks while work is outstanding', async () => {
    const f = fixture(); f.flow.stage('A'.repeat(43)); f.flow.stage('A'.repeat(43)); await tick();
    expect(f.api.previewInvitation).toHaveBeenCalledOnce();
    let resolve!: (v: unknown) => void;
    f.api.acceptInvitation.mockReturnValue(new Promise(done => { resolve = done; }));
    const first = f.flow.accept(); await f.flow.accept();
    expect(f.api.acceptInvitation).toHaveBeenCalledOnce();
    resolve({ logicalDeviceId: 'device-one', share: { state: 'revoked' } }); await first;
    expect(f.flow.state().result?.share.state).toBe('revoked');
  });
  it('requires a new preview after acceptance failure, without losing the retry input', async () => {
    const f = fixture(); f.flow.stage('A'.repeat(43)); await tick();
    f.api.acceptInvitation.mockRejectedValue({ code: 'DEVICE_V2_ROUTE_NOT_READY' });
    await f.flow.accept(); expect(f.flow.state().message).toContain('准备中'); expect(f.flow.hasPending).toBe(true);
    await f.flow.accept(); expect(f.api.acceptInvitation).toHaveBeenCalledOnce();
    await f.flow.refresh(); expect(f.flow.state().phase).toBe('preview');
  });
  it('does not restore a revoked accepted share or accept a mismatched device response', async () => {
    const f = fixture(); f.api.previewInvitation.mockResolvedValueOnce({ ...previewFixture,
      state: 'accepted', currentShare: { state: 'revoked' } });
    f.flow.stage('A'.repeat(43)); await tick(); await f.flow.accept();
    expect(f.api.acceptInvitation).not.toHaveBeenCalled();
    f.flow.stage('A'.repeat(43)); await tick();
    f.api.acceptInvitation.mockResolvedValue({ logicalDeviceId: 'wrong', share: { state: 'active' } });
    await f.flow.accept(); expect(f.flow.state().phase).toBe('error');
  });
});
