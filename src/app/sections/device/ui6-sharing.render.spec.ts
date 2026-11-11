import { ChangeDetectorRef, Component, Input, TemplateRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AlertController, IonModal, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { BDeviceImgComponent } from '../../core/components/b-device-img/b-device-img.component';
import { DEVICE_CONSOLE_HOST } from '../../core/device-v2/console-host';
import { DataService } from '../../core/services/data.service';
import { DeviceConsoleService } from '../../core/services/device-console.service';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { DeviceV2ShareInvitationService } from '../../core/services/device-v2-share-invitation.service';
import { DeviceV2SharingService } from '../../core/services/device-v2-sharing.service';
import { NoticeService } from '../../core/services/notice.service';
import { PublicConsoleBookmarksService } from '../../core/services/public-console-bookmarks.service';
import { UserService } from '../../core/services/user.service';
import { cloudBetaCapabilities, localCapabilities } from '../../../environments/deployment';
import { environment } from '../../../environments/environment';
import { DeviceSharePage } from './device-share/device-share';
import { ShareInvitationPage } from './share-invitation/share-invitation.page';
import { ShareManagerPage } from './share-manager/share-manager.page';

@Component({ selector: 'b-device-img', template: '' })
class DeviceImageStub { @Input() deviceId?: string; }

const ID = 'ui6-owned-device', TOKEN = 'A'.repeat(43);
const originalDeployment = environment.deployment;
const modalViews: { destroy(): void }[] = [];

async function render(kind: 'manager' | 'device' | 'invitation', authenticated = true) {
  const device: any = { cloudEnabled: true, config: { mode: 'bbp2', customName: '客厅设备与长名称', isShared: false } };
  const data: any = { auth: authenticated ? { uuid: 'ui6-account', accessToken: 'fixture' } : null, sessionEpoch: 1,
    authDataChanged: new Subject<void>(), deviceDataLoader: new Subject<boolean>(),
    device: { list: [ID], dict: { [ID]: device } }, share: { byDevice: {}, received: [] }, getDevice: vi.fn(() => device) };
  const sharing = { listReceived: vi.fn(async () => []), listPendingInvitations: vi.fn(async () => ({ items: [], nextCursor: null })),
    listDevice: vi.fn(async () => ({ logicalDeviceId: ID, shares: [], invitations: [] })), createInvitation: vi.fn(),
    revokeShare: vi.fn(), leaveShare: vi.fn(), updateShare: vi.fn(), revokeInvitation: vi.fn(), getInvitation: vi.fn() };
  const invitation = { state: signal<any>({ phase: 'empty' }), refresh: vi.fn(), accept: vi.fn(), decline: vi.fn(),
    clear: vi.fn(), stage: vi.fn(() => true), stageDirected: vi.fn(() => true), code: TOKEN };
  const users = { getAllInfo: vi.fn(async () => true) }, notices = { showToast: vi.fn() };
  const nav = { navigateForward: vi.fn(), navigateBack: vi.fn() };
  const bookmarks = { items: signal<any[]>([]), loading: signal(false), error: signal(''), load: vi.fn(), remove: vi.fn() };
  const consoles = { getLink: vi.fn(async () => ({ publicAccessEnabled: false, link: null })), saveLink: vi.fn() };
  const host = { sessionVersion: 1, sessionChanges: new Subject<void>(), consoleWebBaseUrl: 'https://example.invalid/' };
  const type = kind === 'manager' ? ShareManagerPage : kind === 'device' ? DeviceSharePage : ShareInvitationPage;
  const module = TestBed.configureTestingModule({ imports: [type], providers: [provideRouter([]), provideIonicAngular({ animated: false }),
    provideTranslateService(), { provide: ActivatedRoute, useValue: { snapshot: { params: { id: ID }, paramMap: { get: () => null }, queryParamMap: { get: () => null } } } },
    { provide: DataService, useValue: data }, { provide: DeviceV2SharingService, useValue: sharing },
    { provide: DeviceV2ShareInvitationService, useValue: invitation }, { provide: UserService, useValue: users },
    { provide: NoticeService, useValue: notices }, { provide: NavController, useValue: nav },
    { provide: PublicConsoleBookmarksService, useValue: bookmarks }, { provide: DeviceConsoleService, useValue: consoles },
    { provide: DeviceV2BleService, useValue: { canManagePresenceCredential: vi.fn(async () => false) } },
    { provide: DEVICE_CONSOLE_HOST, useValue: host }, { provide: AlertController, useValue: { create: vi.fn() } }] });
  if (kind === 'manager') module.overrideComponent(ShareManagerPage, { remove: { imports: [BDeviceImgComponent] }, add: { imports: [DeviceImageStub] } });
  await module.compileComponents();
  const fixture = TestBed.createComponent(type as typeof ShareManagerPage);
  const page = fixture.componentInstance as any;
  if (kind === 'manager') page.loaded = true;
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page, element: fixture.nativeElement as HTMLElement, data, device, sharing, invitation, users, nav, bookmarks, consoles };
}

// Render the original Angular ng-template, not an alternate modal template.
// Overlay focus, keyboard and native dismissal remain a UI7 concern.
function modal(f: Awaited<ReturnType<typeof render>>, index: number) {
  const template = f.fixture.debugElement.queryAll(By.directive(IonModal))[index].componentInstance.template as TemplateRef<unknown>;
  const view = template.createEmbeddedView({}); modalViews.push(view); view.detectChanges();
  const element = document.createElement('div');
  for (const node of view.rootNodes) element.appendChild(node);
  return { element, update: () => view.detectChanges() };
}

async function update(f: Awaited<ReturnType<typeof render>>) {
  // Model delivery normally marks the page; direct fixture mutations must mark
  // the actual OnPush component view too, not only the TestBed host view.
  f.fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
  await f.fixture.whenStable();
}

describe('UI6 production sharing grouping and permission boundaries', () => {
  beforeEach(() => { environment.deployment = localCapabilities; });
  afterEach(() => { modalViews.splice(0).forEach(view => view.destroy()); TestBed.resetTestingModule(); environment.deployment = originalDeployment; });

  it('keeps owned inventory separate from received shares and does not read or accept on category changes', async () => {
    const f = await render('manager');
    expect(f.element.querySelector('.device-copy strong')?.textContent).toBe(f.device.config.customName);
    expect(f.element.querySelector('.received-devices')).toBeNull();
    f.element.querySelectorAll<HTMLButtonElement>('.share-categories button')[1].click(); await f.fixture.whenStable();
    expect(f.element.querySelector('.received-devices h2')?.textContent).toBe('已接收设备');
    expect(f.sharing.listReceived).not.toHaveBeenCalled(); expect(f.invitation.accept).not.toHaveBeenCalled();
  });

  it('separates pending invitations, account shares and local public bookmarks, retaining exact actions', async () => {
    const f = await render('manager'); f.page.tab = 'received';
    f.page.pendingInvitations = [{ invitationId: 'invite', deviceName: '待接受设备', role: 'viewer', canEditConsole: true }];
    f.data.share.received = [{ logicalDeviceId: 'received', name: '已共享设备', share: { role: 'operator', canEditConsole: false } }];
    f.bookmarks.items.set([{ region: 'china', logicalDeviceId: 'public', name: '公开收藏', token: TOKEN }]); await update(f);
    expect(f.element.querySelectorAll('.pending-invitations, .received-devices, .local-bookmarks')).toHaveLength(3);
    expect(f.element.querySelector('.pending-invitations small')?.textContent).toContain('仅查看 · 可编辑');
    expect(f.element.querySelector('.local-bookmarks .section-note')?.textContent).toContain('不代表已加入账号共享');
    expect(f.element.querySelector('.local-bookmarks small')?.textContent).toContain('公开设备 · 仅查看');
    f.element.querySelector<HTMLButtonElement>('.pending-invitations .device-row')!.click(); await f.fixture.whenStable();
    expect(f.invitation.stageDirected).toHaveBeenCalledWith('invite'); expect(f.nav.navigateForward).toHaveBeenCalledWith('/share-invitation');
    expect(f.invitation.accept).not.toHaveBeenCalled();
  });

  it('retains loaded shares beside partial refresh errors rather than replacing them with an empty success', async () => {
    const f = await render('manager'); f.page.tab = 'received'; f.page.loadError = '部分分享信息暂未刷新，请重试';
    f.page.invitationError = '待处理邀请暂未刷新，请重试';
    f.data.share.received = [{ logicalDeviceId: 'received', name: '保留的设备', share: { role: 'viewer' } }]; await update(f);
    expect(f.element.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(f.element.querySelector('.received-devices strong')?.textContent).toBe('保留的设备');
    expect(f.element.querySelector('.pending-invitations .text-action')?.textContent).toBe('重试');
  });

  it('shows anonymous local bookmarks without claiming account permission or showing member categories', async () => {
    const f = await render('manager', false);
    expect(f.element.querySelector('.share-categories')).toBeNull(); expect(f.element.querySelector('.received-devices')).toBeNull();
    expect(f.element.querySelector('.local-bookmarks')).not.toBeNull(); expect(f.sharing.listReceived).not.toHaveBeenCalled();
  });

  it('honors closed deployment gates while keeping open-link membership invitations available', async () => {
    environment.deployment = cloudBetaCapabilities;
    const f = await render('device');
    expect(f.element.querySelector('.public-card')).toBeNull();
    expect(f.element.querySelectorAll('.invite-actions button')).toHaveLength(1);
    expect(f.element.querySelector('.invite-actions button')?.textContent).toBe('邀请链接');
    expect(f.consoles.getLink).not.toHaveBeenCalled(); expect(f.sharing.createInvitation).not.toHaveBeenCalled();
  });

  it('keeps owner-only public and invitation controls out of a shared-device view', async () => {
    const f = await render('device'); f.device.config.isShared = true; await update(f);
    expect(f.element.querySelector('.public-card')).toBeNull(); expect(f.element.querySelector('.invite-actions')).toBeNull();
    expect(f.element.querySelector('.sharing-heading h1')?.textContent).toBe(f.device.config.customName);
  });

  it('retains full public links and disables unavailable reads without hiding public-access risk', async () => {
    const f = await render('device'); f.page.publicAccessEnabled = true;
    f.page.viewLink = { token: TOKEN, version: 7, state: 'active', expiresAt: null, publicFields: ['power'] };
    await update(f);
    expect(f.element.querySelectorAll('.copy-action')).toHaveLength(2);
    expect(f.element.querySelector('.public-link')?.textContent).toContain(TOKEN);
    expect(f.element.querySelector('.public-note')?.textContent).toContain('不授予账号成员控制权限');
    f.page.linkError = '链接状态暂不可用'; await update(f);
    expect(f.element.querySelector<HTMLInputElement>('.public-access-row input')?.disabled).toBe(true);
    expect(f.element.querySelector('.link-row[role="alert"]')?.textContent).toContain('重试');
    expect(f.element.querySelectorAll('.copy-action')).toHaveLength(0);
  });

  it('distinguishes active members and pending directed invitations with busy action gates intact', async () => {
    const f = await render('device');
    f.data.share.byDevice[ID] = { shares: [{ shareId: 'active', state: 'active', role: 'viewer', memberRef: '当前成员' }],
      invitations: [{ invitationId: 'targeted', targeted: true, role: 'operator', expiresAt: Date.now() + 1000 },
        { invitationId: 'open', targeted: false, role: 'viewer', expiresAt: Date.now() + 1000 }] };
    await update(f);
    const entries = f.element.querySelectorAll<HTMLButtonElement>('.invitation-entry');
    expect(entries[0].disabled).toBe(true); expect(entries[1].disabled).toBe(false);
    expect(entries[0].textContent).toContain('定向邀请'); expect(entries[0].textContent).toContain('待接受');
    f.page.busyId = 'targeted'; await update(f);
    expect([...f.element.querySelectorAll<HTMLButtonElement>('.member-row button')].every(button => button.disabled)).toBe(true);
  });

  it('uses the original permission modal draft and save action without merging control and Console-edit rights', async () => {
    const f = await render('device'); f.page.permissionRole = 'viewer'; f.page.permissionEdit = true;
    const sheet = modal(f, 1), switches = sheet.element.querySelectorAll<HTMLInputElement>('.permission-option input');
    expect(switches[0].checked).toBe(false); expect(switches[1].checked).toBe(true);
    switches[0].checked = true; switches[0].dispatchEvent(new Event('change', { bubbles: true })); sheet.update();
    expect(f.page.permissionRole).toBe('operator'); expect(f.page.permissionEdit).toBe(true);
    expect(f.sharing.createInvitation).not.toHaveBeenCalled();
    f.page.busyId = 'saving'; sheet.update(); expect(sheet.element.querySelector<HTMLButtonElement>('.options-save')?.disabled).toBe(true);
  });

  it('retains public-link failure draft and explicit rotate/revoke controls in the original modal', async () => {
    const f = await render('device'); f.page.publicAccessEnabled = true; f.page.linkDays = 30;
    f.page.viewLink = { token: TOKEN, version: 7, state: 'active', expiresAt: null, publicFields: [] };
    f.page.linkError = '保存失败，请重新读取链接状态后重试';
    const sheet = modal(f, 2);
    expect(sheet.element.querySelector('.expiry-options .selected')?.textContent?.trim()).toBe('30 天');
    expect(sheet.element.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
    expect(sheet.element.querySelectorAll('.link-management button')).toHaveLength(2);
    expect(sheet.element.querySelector('.options-note')?.textContent).toContain('不改变已授权成员的权限');
    expect(f.consoles.saveLink).not.toHaveBeenCalled(); expect(f.page.linkDays).toBe(30);
  });

  it('shows targeted rejection only for a pending directed invitation and blocks actions while accepting', async () => {
    const f = await render('invitation');
    const preview = { deviceName: '待分享的设备', role: 'viewer', canEditConsole: true, targeted: true, state: 'pending', expiresAt: Date.now() + 1000 };
    f.invitation.state.set({ phase: 'preview', preview }); await f.fixture.whenStable();
    expect(f.element.querySelector('.invitation-details')?.textContent).toContain('仅查看');
    expect(f.element.querySelector('.invitation-details')?.textContent).toContain('编辑控制台');
    expect(f.element.querySelectorAll('.invitation-actions ion-button')).toHaveLength(2);
    f.invitation.state.set({ phase: 'accepting', preview }); await f.fixture.whenStable();
    expect([...f.element.querySelectorAll<any>('.invitation-actions ion-button')].every(button => button.disabled)).toBe(true);
    f.invitation.state.set({ phase: 'preview', preview: { ...preview, targeted: false } }); await f.fixture.whenStable();
    expect(f.element.querySelectorAll('.invitation-actions ion-button')).toHaveLength(1);
    expect(f.invitation.accept).not.toHaveBeenCalled(); expect(f.invitation.decline).not.toHaveBeenCalled();
  });

  it('does not offer accepting again after an accepted share has been revoked', async () => {
    const f = await render('invitation'); f.invitation.state.set({ phase: 'preview', preview: {
      deviceName: '已解除设备', role: 'viewer', state: 'accepted', currentShare: { state: 'revoked' } } }); await f.fixture.whenStable();
    expect(f.element.querySelector('.status-message')?.textContent).toContain('分享已解除');
    expect(f.element.querySelectorAll('.invitation-actions ion-button')).toHaveLength(0);
  });

  it('keeps accepted state and sync feedback when opening fails, retrying only the original directory-read path', async () => {
    const f = await render('invitation'); f.users.getAllInfo.mockResolvedValue(false);
    f.invitation.state.set({ phase: 'accepted', result: { logicalDeviceId: ID, share: { state: 'active' }, realtimeRefreshPending: true } });
    await f.page.openDevice(); await f.fixture.whenStable();
    expect(f.element.querySelector('.status-panel h1')?.textContent).toBe('已接受分享');
    expect(f.element.querySelector('.sync-notice')?.textContent).toBe('设备权限同步中');
    expect(f.element.querySelector('.open-error')?.textContent).toContain('分享已领取');
    expect(f.element.querySelector('ion-button')?.textContent).toBe('进入设备');
    expect(f.invitation.accept).not.toHaveBeenCalled(); expect(f.users.getAllInfo).toHaveBeenCalledTimes(1);
  });

  it('keeps loading, failed reads and empty invitation states distinct without automatic acceptance', async () => {
    const f = await render('invitation'); f.invitation.state.set({ phase: 'loading' }); await f.fixture.whenStable();
    expect(f.element.querySelector('[role="status"]')?.textContent).toContain('正在读取邀请');
    f.invitation.state.set({ phase: 'error', message: '邀请暂不可用，请重试' }); await f.fixture.whenStable();
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('邀请暂不可用');
    expect(f.element.querySelector('ion-button')?.textContent).toBe('重试');
    f.invitation.state.set({ phase: 'empty' }); await f.fixture.whenStable();
    expect(f.element.querySelector('.status-message')?.textContent).toBe('请从邀请链接打开');
    expect(f.invitation.accept).not.toHaveBeenCalled(); expect(f.sharing.createInvitation).not.toHaveBeenCalled();
  });
});
