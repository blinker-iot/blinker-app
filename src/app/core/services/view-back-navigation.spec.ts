import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from '@capacitor/app';
import { ViewService } from './view.service';

vi.mock('@capacitor/app', () => ({ App: { minimizeApp: vi.fn() } }));

// Only the back-navigation policy is exercised. Constructing a prototype avoids
// initializing theme, native shortcut listeners or an authenticated App session.
function setup(pathname = '/share-manager') {
  const service = Object.create(ViewService.prototype) as ViewService;
  let handler!: () => Promise<void>;
  const platform = { backButton: { subscribeWithPriority: vi.fn((_priority: number, callback: () => Promise<void>) => {
    handler = callback;
  }) } };
  const nav = { pop: vi.fn() }, menu = { close: vi.fn() };
  const modal = { getTop: vi.fn(async (): Promise<object | undefined> => undefined), dismiss: vi.fn() };
  Object.assign(service, { platform, platformLocation: { pathname }, navCtrl: nav, menu, modalCtrl: modal,
    menuSwipeEnable: false, devicePageIsRoot: false });
  service.listenBackButton();
  return { service, platform, nav, menu, modal, press: () => handler() };
}

describe('App hardware back navigation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs below installed Ionic overlays/menus and above its default navigation, without a second pop', async () => {
    const f = setup();
    const priority = f.platform.backButton.subscribeWithPriority.mock.calls[0][0];
    const ionicBack = readFileSync(resolve('node_modules/@ionic/core/dist/collection/utils/hardware-back-button.js'), 'utf8');
    const constant = (name: string) => Number(ionicBack.match(new RegExp(`export const ${name} = (\\d+)`))?.[1]);
    expect(priority).toBeLessThan(constant('OVERLAY_BACK_BUTTON_PRIORITY'));
    expect(priority).toBeLessThan(constant('MENU_BACK_BUTTON_PRIORITY'));
    const ionicNav = readFileSync(resolve('node_modules/@ionic/angular/esm2022/common/providers/nav-controller.mjs'), 'utf8');
    const navigationPriority = Number(ionicNav.match(/backButton\.subscribeWithPriority\((\d+)/)?.[1]);
    expect(priority).toBeGreaterThan(navigationPriority);
    await f.press();
    expect(f.nav.pop).toHaveBeenCalledTimes(1);
    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('preserves the existing modal fallback without popping its underlying page', async () => {
    const f = setup(); f.modal.getTop.mockResolvedValueOnce({});
    await f.press();
    expect(f.modal.dismiss).toHaveBeenCalledTimes(1);
    expect(f.nav.pop).not.toHaveBeenCalled();
    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('preserves the legacy view menu-close branch', async () => {
    const f = setup('/view/home'); f.service.menuSwipeEnable = true;
    await f.press();
    expect(f.menu.close).toHaveBeenCalledTimes(1);
    expect(f.nav.pop).not.toHaveBeenCalled();
    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('preserves minimizing a legacy root view', async () => {
    const f = setup('/view/home'); await f.press();
    expect(App.minimizeApp).toHaveBeenCalledTimes(1);
    expect(f.nav.pop).not.toHaveBeenCalled();
  });

  it('preserves minimizing a shortcut-root device page', async () => {
    const f = setup('/device/test'); f.service.devicePageIsRoot = true;
    await f.press();
    expect(App.minimizeApp).toHaveBeenCalledTimes(1);
    expect(f.nav.pop).not.toHaveBeenCalled();
  });

  it('does not minimize unrelated pages when the device-root flag is set', async () => {
    const f = setup('/automation-manager'); f.service.devicePageIsRoot = true;
    await f.press();
    expect(f.nav.pop).toHaveBeenCalledTimes(1);
    expect(App.minimizeApp).not.toHaveBeenCalled();
  });
});
