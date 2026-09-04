import { AlertController } from '@ionic/angular';

import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceService } from '../../core/services/device.service';
import { NoticeService } from '../../core/services/notice.service';
import { TestDeviceDashboardComponent } from './test-device-dashboard.component';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
}));

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: class {},
  LoadingController: class {},
  Platform: class {},
  ToastController: class {},
}));

describe('TestDeviceDashboardComponent interface actions', () => {
  const present = vi.fn().mockResolvedValue(undefined);
  const createAlert = vi.fn().mockResolvedValue({ present });
  const saveDeviceConfig = vi.fn().mockResolvedValue(true);
  const showToast = vi.fn().mockResolvedValue(undefined);
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
      { create: createAlert } as unknown as AlertController,
      { showToast } as unknown as NoticeService,
    );
    component.device = device;
  });

  it('maps the two buttons to Customizer and Layouter2Component', () => {
    expect(
      component.interfaceActions.map(({ title, componentName }) => ({
        title,
        componentName,
      })),
    ).toEqual([
      { title: '使用AI生成界面', componentName: 'Customizer' },
      {
        title: '使用拖拽编辑器界面',
        componentName: 'Layouter2Component',
      },
    ]);
  });

  it.each([
    [0, 'Customizer', 'AI生成界面'],
    [1, 'Layouter2Component', '拖拽编辑器界面'],
  ] as const)(
    'confirms and applies action %i as %s',
    async (actionIndex, componentName, confirmName) => {
      const action = component.interfaceActions[actionIndex];
      await component.selectInterface(action);

      expect(createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          header: `确定切换到${confirmName}？`,
          message: '确认后将修改当前设备使用的界面组件。',
        }),
      );
      expect(saveDeviceConfig).not.toHaveBeenCalled();
      const alertOptions = createAlert.mock.calls[0][0];
      await alertOptions.buttons[1].handler();

      expect(saveDeviceConfig).toHaveBeenCalledWith(device, {
        component: componentName,
      });
      expect(device.config.component).toBe(componentName);
      expect(showToast).toHaveBeenCalledWith('界面配置已更新');
      expect(subjectNext).toHaveBeenCalledWith({
        key: 'component',
        value: componentName,
        source: 'test-dashboard',
      });
      expect(showToast.mock.invocationCallOrder[0]).toBeLessThan(
        subjectNext.mock.invocationCallOrder[0],
      );
    },
  );

  it('keeps the dashboard active when saving fails', async () => {
    saveDeviceConfig.mockResolvedValueOnce(false);
    await component.selectInterface(component.interfaceActions[0]);
    const alertOptions = createAlert.mock.calls[0][0];
    await alertOptions.buttons[1].handler();

    expect(device.config.component).toBe('TestDashboard');
    expect(subjectNext).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      '界面配置保存失败，请稍后重试',
    );
  });

  it('switches preview devices locally without saving through the API', async () => {
    device.config.isPreview = true;
    await component.selectInterface(component.interfaceActions[1]);
    const alertOptions = createAlert.mock.calls[0][0];
    await alertOptions.buttons[1].handler();

    expect(saveDeviceConfig).not.toHaveBeenCalled();
    expect(device.config.component).toBe('Layouter2Component');
    expect(subjectNext).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'Layouter2Component' }),
    );
  });
});
