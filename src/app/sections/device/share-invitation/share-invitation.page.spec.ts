import { signal } from '@angular/core';
import { ShareInvitationPage } from './share-invitation.page';

describe('ShareInvitationPage opens only current accepted devices', () => {
  function fixture() {
    const result = { logicalDeviceId: 'device-one', share: { state: 'active' }, realtimeRefreshPending: true };
    const flow = { state: signal<any>({ phase: 'preview' }), refresh: vi.fn(), clear: vi.fn(),
      stage: vi.fn().mockReturnValue(true), code: null,
      accept: vi.fn(async () => { flow.state.set({ phase: 'accepted', result }); }) };
    const data: any = { sessionEpoch: 1, getDevice: vi.fn().mockReturnValue({ id: 'device-one' }) };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    const nav = { navigateForward: vi.fn(), navigateBack: vi.fn() };
    const route = { snapshot: { paramMap: { get: vi.fn().mockReturnValue(null) } } };
    const router = { url: '/home/device' };
    const page = new ShareInvitationPage(flow as any, users as any, data, nav as any, route as any, router as any);
    return { page, flow, result, data, users, nav, route, router };
  }
  it('opens the existing device page after directory refresh and does not put proof in the route', async () => {
    const f = fixture(); await f.page.accept();
    expect(f.users.getAllInfo).toHaveBeenCalledOnce();
    expect(f.nav.navigateForward).toHaveBeenCalledWith(['/device', 'device-one']);
    expect(f.flow.clear).toHaveBeenCalledOnce();
  });
  it('retries opening a committed share without accepting again after inventory failure', async () => {
    const f = fixture(); f.users.getAllInfo.mockResolvedValueOnce(false);
    await f.page.accept(); expect(f.nav.navigateForward).not.toHaveBeenCalled();
    expect(f.page.openError).toContain('已领取');
    await f.page.openDevice(); expect(f.flow.accept).toHaveBeenCalledOnce();
    expect(f.nav.navigateForward).toHaveBeenCalledOnce();
  });
  it('does not navigate for a revoked result or a late old-account refresh', async () => {
    const f = fixture(); f.result.share.state = 'revoked';
    await f.page.accept(); expect(f.users.getAllInfo).not.toHaveBeenCalled();
    f.result.share.state = 'active'; let resolve!: (v: boolean) => void;
    f.users.getAllInfo.mockReturnValue(new Promise(done => { resolve = done; }));
    const task = f.page.openDevice(); f.data.sessionEpoch++; resolve(true); await task;
    expect(f.nav.navigateForward).not.toHaveBeenCalled();
  });
  it('preserves pending input for login, but clears it when otherwise leaving the confirmation page', () => {
    const f = fixture(); f.page.login(); f.page.ionViewDidLeave();
    expect(f.flow.clear).not.toHaveBeenCalled();
    f.page.ionViewWillEnter(); f.page.ionViewDidLeave(); expect(f.flow.clear).toHaveBeenCalledOnce();
  });

  it('does not clear a successor invitation during the old page transition', () => {
    const f = fixture();
    f.router.url = '/share-invitation/' + 'B'.repeat(43);
    f.page.ionViewDidLeave();
    expect(f.flow.clear).not.toHaveBeenCalled();
  });

  it('uses the routed invitation through the common preview flow and rejects invalid input', () => {
    const f = fixture(), code = 'A'.repeat(43);
    f.route.snapshot.paramMap.get.mockReturnValue(code);
    f.page.ionViewWillEnter();
    expect(f.flow.stage).toHaveBeenCalledWith(code);
    expect(f.flow.refresh).toHaveBeenCalledOnce();
    expect(f.flow.accept).not.toHaveBeenCalled();
    f.flow.stage.mockReturnValue(false);
    f.page.ionViewWillEnter();
    expect(f.flow.clear).toHaveBeenCalledOnce();
  });
});
