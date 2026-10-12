import { ChangeDetectorRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { IonBackButton, IonRouterLink, IonRouterOutlet, ModalController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject } from 'rxjs';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DebugService } from '../debug/debug.service';
import { DeviceService } from '../core/services/device.service';
import { ViewService } from '../core/services/view.service';
import { DevicePage } from './device.page';

// Use the production shell template and the same standalone outlet as AppComponent.
// Only the dynamic device body is excluded: this gate performs no device/network I/O.
@Component({ imports: [IonRouterOutlet, DevicePage],
  template: '<ion-router-outlet><app-device /></ion-router-outlet>' })
class DeviceNavigationHost {}

async function render() {
  const deviceService = { connectDevice: vi.fn(), disconnectDevice: vi.fn(), queryDevice: vi.fn() };
  await TestBed.configureTestingModule({ imports: [DeviceNavigationHost], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: DeviceService, useValue: deviceService },
    { provide: DataService, useValue: { device: { dict: {} }, initCompleted: new BehaviorSubject(false) } },
    { provide: ViewService, useValue: { devicePageIsRoot: false } },
    { provide: DebugService, useValue: { init: vi.fn(), end: vi.fn() } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(DeviceNavigationHost);
  fixture.detectChanges();
  const shellElement = fixture.debugElement.query(By.directive(DevicePage));
  const shell = shellElement.componentInstance as DevicePage;
  vi.spyOn(shell as any, 'loadDevice').mockImplementation(() => undefined);
  shell.id = 'device-one';
  shell.device = { id: shell.id, deviceName: shell.id, config: { mode: 'bbp2', customName: '测试设备' }, data: {} } as BlinkerDevice;
  shell.deviceComponent = 'DeviceV2'; shell.loaded = true;
  shellElement.injector.get(ChangeDetectorRef).markForCheck();
  fixture.detectChanges();
  const outlet = fixture.debugElement.query(By.directive(IonRouterOutlet)).componentInstance as IonRouterOutlet;
  const backElement = fixture.debugElement.query(By.css('app-device ion-back-button'));
  const back = backElement.componentInstance as IonBackButton;
  return { fixture, outlet, back, backElement, deviceService, nav: TestBed.inject(NavController) };
}

describe('DevicePage production navigation under the standalone App outlet', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it.each([true, false])('injects the actual ancestor outlet and uses the normal back handler when history=%s', async history => {
    const f = await render();
    expect(f.back).toBeInstanceOf(IonBackButton);
    expect((f.back as any).routerOutlet).toBe(f.outlet);
    const canGoBack = vi.spyOn(f.outlet, 'canGoBack').mockReturnValue(history);
    const pop = vi.spyOn(f.outlet, 'pop').mockResolvedValue(true);
    const direction = vi.spyOn(f.nav, 'setDirection');
    const fallback = vi.spyOn(f.nav, 'navigateBack').mockResolvedValue(true);
    const native = f.backElement.nativeElement as HTMLElement;
    native.click(); await f.fixture.whenStable();
    expect(canGoBack).toHaveBeenCalledOnce();
    if (history) {
      expect(pop).toHaveBeenCalledOnce(); expect(direction).toHaveBeenCalledWith('back', undefined, undefined, undefined);
      expect(fallback).not.toHaveBeenCalled();
    } else {
      expect(pop).not.toHaveBeenCalled(); expect(fallback).toHaveBeenCalledWith('/home/device', { animation: undefined });
    }
    expect(f.deviceService.connectDevice).not.toHaveBeenCalled(); expect(f.deviceService.queryDevice).not.toHaveBeenCalled();
    f.fixture.destroy();
  });

  it('retains the existing forward RouterLink direction for the real settings button', async () => {
    const f = await render();
    const settings = f.fixture.debugElement.query(By.directive(IonRouterLink));
    expect(settings.nativeElement.tagName).toBe('ION-BUTTON');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const direction = vi.spyOn(f.nav, 'setDirection');
    settings.nativeElement.click(); await f.fixture.whenStable();
    expect(direction).toHaveBeenCalledWith('forward', undefined, undefined, undefined);
    expect(navigate).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).serializeUrl(navigate.mock.calls[0][0] as any)).toBe('/device-manager/device-one');
    expect(f.deviceService.connectDevice).not.toHaveBeenCalled();
    f.fixture.destroy();
  });

  it('resolves the shell overlay from the real standalone root without module or mock providers', async () => {
    const f = await render();
    const shell = f.fixture.debugElement.query(By.directive(DevicePage)).componentInstance as DevicePage;
    expect((shell as any).modalCtrl).toBe(TestBed.inject(ModalController));
    expect(TestBed.inject(ModalController)).toBeInstanceOf(ModalController);
    f.fixture.destroy();
  });
});
