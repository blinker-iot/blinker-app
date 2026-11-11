import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { TOOL_MENU_GROUPS } from '../../../tools/tool-menu.config';
import { TabToolsComponent } from './tab-tools';

const routes = [
  ['esp32-provision', '/tools/esp32-provision'],
  ['ble-debug', '/tools/ble-debug'],
  ['lan-discovery', '/tools/lan-discovery'],
  ['ble-ota', '/tools/ble-ota'],
  ['wifi-ota', '/tools/wifi-ota'],
] as const;
const comingSoon = [
  'mqtt-client', 'tcp-udp', 'http-websocket', 'modbus',
  'network-diagnostics', 'crc-hex', 'scan-device-info',
] as const;

describe('UI6 tools production template', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    const router = { navigate: vi.fn(async () => true) };
    const navigation = { navigateForward: vi.fn(async () => true) };
    const toast = { present: vi.fn(async () => undefined) };
    const toasts = { create: vi.fn(async () => toast) };
    await TestBed.configureTestingModule({
      imports: [TabToolsComponent],
      providers: [
        provideIonicAngular({ animated: false }), provideTranslateService(),
        { provide: Router, useValue: router },
        { provide: NavController, useValue: navigation },
        { provide: ToastController, useValue: toasts },
      ],
    }).overrideProvider(ToastController, { useValue: toasts }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    const labels: Record<string, string> = {
      GROUP_DEVICE_CONNECTION: '设备接入', GROUP_FIRMWARE_UPGRADE: '固件升级',
      GROUP_COMMUNICATION_DEBUG: '通信调试', GROUP_DIAGNOSTICS: '诊断工具',
      COMING_SOON: '即将上线', COMING_SOON_MESSAGE: '{{title}} 即将上线',
      ESP32_PROVISION_TITLE: 'ESP32 配网', ESP32_PROVISION_DESCRIPTION: '通过现有配网流程连接设备',
    };
    for (const group of TOOL_MENU_GROUPS) for (const tool of group.tools) {
      for (const value of [tool.title, tool.description]) {
        if (value?.startsWith('TOOLS.')) labels[value.slice(6)] ??= `本地化 ${tool.id}`;
      }
    }
    translate.setTranslation('ui6-tools-test', { NAVIGATION: { TOOLS: '工具' }, TOOLS: labels });
    translate.use('ui6-tools-test');
    const fixture = TestBed.createComponent(TabToolsComponent);
    // The legacy IonicModule and standalone barrels expose different overlay
    // controller classes. Mock the exact token used by this production page.
    expect(fixture.debugElement.injector.get(ToastController)).toBe(toasts);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const rows = Array.from(element.querySelectorAll<HTMLButtonElement>('.menu-row'));
    const allTools = fixture.componentInstance.groups.flatMap(group => group.tools);
    const row = (id: string) => rows[allTools.findIndex(tool => tool.id === id)];
    return { fixture, element, rows, allTools, row, router, navigation, toasts, toast };
  }

  it('keeps the four original groups and twelve entries in settings surfaces, without starting a tool', async () => {
    const h = await render();
    expect(Array.from(h.element.querySelectorAll('.tool-section h2'), node => node.textContent?.trim()))
      .toEqual(['设备接入', '固件升级', '通信调试', '诊断工具']);
    expect(h.element.querySelector('ion-header')?.classList).toContain('main-tab-header');
    expect(h.element.querySelector<HTMLElement & { fullscreen: boolean }>('ion-content')?.fullscreen).toBe(true);
    expect(h.element.querySelectorAll('.menu-list--settings')).toHaveLength(4);
    expect(h.rows).toHaveLength(12);
    expect(h.allTools.map(tool => tool.id)).toEqual([...routes.map(([id]) => id), ...comingSoon]);
    for (const section of h.element.querySelectorAll('.tool-section')) {
      const id = section.getAttribute('aria-labelledby');
      expect(id).toBeTruthy();
      expect(section.querySelector(`#${id}`)?.tagName).toBe('H2');
    }
    expect(h.router.navigate).not.toHaveBeenCalled();
    expect(h.navigation.navigateForward).not.toHaveBeenCalled();
    expect(h.toasts.create).not.toHaveBeenCalled();
  });

  it('localizes descriptions and coming-soon status without presenting an unavailable route as enabled', async () => {
    const h = await render();
    expect(h.element.textContent).not.toContain('TOOLS.');
    expect(h.row('esp32-provision').querySelector('.menu-title')?.textContent).toBe('ESP32 配网');
    expect(h.row('esp32-provision').querySelector('.menu-description')?.textContent).toBe('通过现有配网流程连接设备');
    for (const tool of h.allTools) {
      const row = h.row(tool.id);
      expect(row.querySelector('.menu-icon')?.getAttribute('aria-hidden')).toBe('true');
      expect(Array.from(row.querySelector('.menu-icon i')!.classList).sort()).toEqual(['fa-light', tool.icon!].sort());
      expect(row.disabled).toBe(false);
      if (tool.route) {
        expect(row.querySelector('.menu-arrow')).not.toBeNull();
        expect(row.querySelector('.menu-badge')).toBeNull();
      } else {
        expect(row.querySelector('.menu-arrow')).toBeNull();
        expect(row.querySelector('.menu-badge')?.textContent?.trim()).toBe('即将上线');
        expect(row.classList).toContain('menu-row--muted');
      }
    }
  });

  it.each(routes)('keeps %s on the existing tab-history and navigation path', async (id, route) => {
    const h = await render();
    h.row(id).click();
    await h.fixture.whenStable();
    expect(h.router.navigate).toHaveBeenCalledExactlyOnceWith(['/home/tools'], { replaceUrl: true });
    expect(h.navigation.navigateForward).toHaveBeenCalledExactlyOnceWith(route);
    expect(h.router.navigate.mock.invocationCallOrder[0]).toBeLessThan(h.navigation.navigateForward.mock.invocationCallOrder[0]);
    expect(h.toasts.create).not.toHaveBeenCalled();
  });

  it.each(comingSoon)('keeps %s on the existing translated toast without adding a route', async id => {
    const h = await render();
    h.row(id).click();
    await h.fixture.whenStable();
    const tool = h.allTools.find(tool => tool.id === id)!;
    expect(tool.route).toBeUndefined();
    expect(tool.muted).toBe(true);
    expect(h.toasts.create).toHaveBeenCalledExactlyOnceWith({
      message: `${tool.title} 即将上线`, duration: 1600, position: 'bottom',
    });
    expect(h.toast.present).toHaveBeenCalledOnce();
    expect(h.router.navigate).not.toHaveBeenCalled();
    expect(h.navigation.navigateForward).not.toHaveBeenCalled();
  });
});
