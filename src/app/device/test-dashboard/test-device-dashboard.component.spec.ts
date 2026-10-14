import { NavController } from '@ionic/angular';
import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceService } from '../../core/services/device.service';
import { TestDeviceDashboardComponent } from './test-device-dashboard.component';

vi.mock('@ionic/angular', () => ({
  NavController: class {},
}));

vi.mock('@ionic/angular/standalone', () => ({
  NavController: class {},
  LoadingController: class {},
  Platform: class {},
  ToastController: class {},
}));

describe('TestDeviceDashboardComponent interface actions', () => {
  const navigateForward = vi.fn().mockResolvedValue(true);
  const saveDeviceConfig = vi.fn().mockResolvedValue(true);
  const subjectNext = vi.fn();
  let device: BlinkerDevice;
  let component: TestDeviceDashboardComponent;

  beforeEach(() => {
    vi.clearAllMocks();

    device = {
      id: 'device-1',
      deviceName: 'device-1',
      config: {
        broker: 'blinker',
        customName: '测试设备',
        mode: 'mqtt',
        component: 'TestDashboard',
      },
      data: {},
      storage: {},
      subject: { next: subjectNext },
    } as unknown as BlinkerDevice;

    component = new TestDeviceDashboardComponent(
      { saveDeviceConfig } as unknown as DeviceService,
      { navigateForward } as unknown as NavController,
      {} as never,
      { markForCheck: vi.fn() } as never,
    );

    component.device = device;
  });

  it('offers AI generation and manual panel editing', () => {
    expect(component.interfaceActions.map(action => action.id)).toEqual(['ai', 'layouter']);
  });

  it.each([
    [0, '/device-manager/device-1/uic'],
    [1, '/device/device-1/edit'],
  ] as const)('opens action %i at %s without switching the saved interface', async (index, path) => {
    await component.selectInterface(component.interfaceActions[index]);
    expect(navigateForward).toHaveBeenCalledWith(path);
    expect(saveDeviceConfig).not.toHaveBeenCalled();
    expect(subjectNext).not.toHaveBeenCalled();
    expect(device.config.component).toBe('TestDashboard');
  });

  it('keeps the dashboard active when navigation fails', async () => {
    navigateForward.mockResolvedValueOnce(false);
    await component.selectInterface(component.interfaceActions[0]);
    expect(device.config.component).toBe('TestDashboard');
    expect(subjectNext).not.toHaveBeenCalled();
  });

  it('opens the editor for preview devices without saving through the API', async () => {
    device.config.isPreview = true;

    await component.selectInterface(component.interfaceActions[1]);
    expect(saveDeviceConfig).not.toHaveBeenCalled();
    expect(navigateForward).toHaveBeenCalledWith('/device/device-1/edit');
    expect(device.config.component).toBe('TestDashboard');
  });
});
