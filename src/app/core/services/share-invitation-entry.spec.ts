import { ViewService } from './view.service';
import { LoginPage } from '../../sections/login/login';

describe('share entry routing', () => {
  it('routes notification IDs to the existing message page, never directly to an invitation', () => {
    const router = { navigate: vi.fn() };
    const context = { router, ngzone: { run: (work: () => void) => work() } };
    (ViewService.prototype as any).openMessageFromLink.call(context, 'message-1');
    expect(router.navigate).toHaveBeenCalledWith(['/message'], {
      queryParams: { messageId: 'message-1' }, replaceUrl: true,
    });
  });
  it('routes a native share link through the same flow without putting its proof in the router', () => {
    const code = 'A'.repeat(43), shareInvitation = { stage: vi.fn() }, router = { navigate: vi.fn() };
    const context = { shareInvitation, router, ngzone: { run: (work: () => void) => work() }, openDeviceFromLink: vi.fn() };
    (ViewService.prototype as any).openAppLink.call(context, 'diandeng://share/' + code);
    expect(shareInvitation.stage).toHaveBeenCalledWith('diandeng://share/' + code);
    expect(router.navigate).toHaveBeenCalledWith(['/share-invitation'], { replaceUrl: true });
    expect(JSON.stringify(router.navigate.mock.calls)).not.toContain(code);
    (ViewService.prototype as any).openAppLink.call(context, 'https://untrusted.example/share/' + code);
    expect(shareInvitation.stage).toHaveBeenCalledOnce();
  });
  it('returns a successful login to the pending confirmation, otherwise preserves the normal home route', () => {
    const navCtrl = { navigateRoot: vi.fn() }, shareInvitation = { hasPending: true };
    const route = { snapshot: { queryParamMap: { get: () => null } } };
    (LoginPage.prototype as any).returnAfterLogin.call({ navCtrl, shareInvitation, route });
    expect(navCtrl.navigateRoot).toHaveBeenLastCalledWith('/share-invitation');
    shareInvitation.hasPending = false;
    (LoginPage.prototype as any).returnAfterLogin.call({ navCtrl, shareInvitation, route });
    expect(navCtrl.navigateRoot).toHaveBeenLastCalledWith('/');
  });
});
