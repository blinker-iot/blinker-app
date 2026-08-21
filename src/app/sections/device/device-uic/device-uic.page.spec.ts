import { ActivatedRoute } from '@angular/router';
import { AlertController, NavController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { NoticeService } from '../../../core/services/notice.service';
import { DeviceUicPage } from './device-uic.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonicModule: class {},
  NavController: class {},
}));

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: class {},
  LoadingController: class {},
  Platform: class {},
  ToastController: class {},
}));

describe('DeviceUicPage', () => {
  const navigateRoot = vi.fn().mockResolvedValue(true);
  const present = vi.fn().mockResolvedValue(undefined);
  const dismiss = vi.fn().mockResolvedValue(undefined);
  const createAlert = vi.fn().mockResolvedValue({ present, dismiss });
  const saveDeviceConfig = vi.fn().mockResolvedValue(true);
  const showToast = vi.fn().mockResolvedValue(undefined);

  let device: BlinkerDevice;
  let page: DeviceUicPage;

  function createPage(id = 'device-1'): DeviceUicPage {
    const route = {
      snapshot: {
        paramMap: {
          get: (key: string) => (key === 'id' ? id : null),
        },
      },
    } as unknown as ActivatedRoute;

    device = {
      id,
      deviceName: id,
      config: {
        broker: 'blinker',
        customName: '测试设备',
        mode: 'mqtt',
      },
      data: {},
      storage: {},
      subject: { next: vi.fn() },
    } as unknown as BlinkerDevice;
    const dataService = {
      device: { dict: { [id]: device }, list: [id] },
      userDataLoader: new BehaviorSubject(false),
    } as unknown as DataService;

    const result = new DeviceUicPage(
      route,
      { navigateRoot } as unknown as NavController,
      { create: createAlert } as unknown as AlertController,
      dataService,
      { saveDeviceConfig } as unknown as DeviceService,
      { showToast } as unknown as NoticeService,
    );
    result.ngOnInit();
    return result;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    page = createPage();
  });

  afterEach(() => {
    page.ngOnDestroy();
  });

  it('maps the three methods to their registered device components', () => {
    expect(page.methodItems.map((item) => item.title)).toEqual([
      'AI生成界面',
      '拖拽编辑器（经典版）',
      '调试工具界面',
    ]);
    expect(page.methodItems.map((item) => item.componentName)).toEqual([
      'Customizer',
      'Layouter2Component',
      'TestDashboard',
    ]);
    expect(page.backHref).toBe('/device-manager/device-1');
  });

  it('offers and saves the automatic DeviceV2 interface for bbp2 devices', async () => {
    device.config.mode = 'bbp2';

    expect(page.availableMethodItems).toHaveLength(4);
    const automaticMethod = page.availableMethodItems[0];
    expect(automaticMethod).toMatchObject({
      title: '自动适配界面',
      componentName: 'DeviceV2',
    });

    await page.selectMethod(automaticMethod);

    expect(createAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        header: '确定使用自动适配界面？',
        message: '确认后将修改当前设备使用的界面组件。',
      }),
    );
    const alertOptions = createAlert.mock.calls[0][0];
    await alertOptions.buttons[1].handler();

    expect(saveDeviceConfig).toHaveBeenCalledWith(device, {
      component: 'DeviceV2',
    });
    expect(device.config.component).toBe('DeviceV2');
    expect(device.subject.next).toHaveBeenCalledWith({
      key: 'component',
      value: 'DeviceV2',
      source: 'device-uic',
    });
    expect(navigateRoot).toHaveBeenCalledWith('/device/device-1');
  });

  it.each([
    [0, 'Customizer'],
    [1, 'Layouter2Component'],
    [2, 'TestDashboard'],
  ] as const)(
    'confirms and saves method %i as component %s',
    async (methodIndex, componentName) => {
      await page.selectMethod(page.methodItems[methodIndex]);

      expect(saveDeviceConfig).not.toHaveBeenCalled();
      expect(createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          header: `确定使用${page.methodItems[methodIndex].title}？`,
          message: '确认后将修改当前设备使用的界面组件。',
        }),
      );
      expect(present).toHaveBeenCalled();

      const alertOptions = createAlert.mock.calls[0][0];
      const confirmButton = alertOptions.buttons[1];
      await confirmButton.handler();

      expect(saveDeviceConfig).toHaveBeenCalledWith(device, {
        component: componentName,
      });
      expect(device.config.component).toBe(componentName);
      expect(device.subject.next).toHaveBeenCalledWith({
        key: 'component',
        value: componentName,
        source: 'device-uic',
      });
      expect(showToast).toHaveBeenCalledWith('界面配置已更新');
      expect(navigateRoot).toHaveBeenCalledWith('/device/device-1');
    },
  );

  it('does not change local configuration when saving fails', async () => {
    saveDeviceConfig.mockResolvedValueOnce(false);

    await page.selectMethod(page.methodItems[2]);
    const alertOptions = createAlert.mock.calls[0][0];
    await alertOptions.buttons[1].handler();

    expect(device.config.component).toBeUndefined();
    expect(device.subject.next).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      '界面配置保存失败，请稍后重试',
    );
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('updates preview devices locally without calling the API', async () => {
    device.config.isPreview = true;

    await page.selectMethod(page.methodItems[1]);
    const alertOptions = createAlert.mock.calls[0][0];
    await alertOptions.buttons[1].handler();

    expect(saveDeviceConfig).not.toHaveBeenCalled();
    expect(device.config.component).toBe('Layouter2Component');
    expect(navigateRoot).toHaveBeenCalledWith('/device/device-1');
  });
});
