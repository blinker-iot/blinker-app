import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonicModule,
  NavController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';

import {
  MenuListComponent,
  MenuListItem,
} from '../../../core/components/menu-list/menu-list';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { NoticeService } from '../../../core/services/notice.service';

type DeviceComponentName =
  | 'DeviceV2'
  | 'Customizer'
  | 'Layouter2Component'
  | 'TestDashboard';

interface DeviceUicMethod extends MenuListItem {
  componentName: DeviceComponentName;
}

@Component({
  selector: 'app-device-uic',
  templateUrl: './device-uic.page.html',
  styleUrls: ['./device-uic.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, MenuListComponent],
})
export class DeviceUicPage implements OnInit, OnDestroy {
  readonly id: string;
  readonly backHref: string;
  readonly methodItems: readonly DeviceUicMethod[];

  private readonly automaticMethod: DeviceUicMethod = {
    id: 'automatic',
    icon: 'fa-sparkles',
    iconColor: 'var(--ion-color-primary)',
    title: '自动适配界面',
    description: '按设备能力自动生成并更新控制界面',
    componentName: 'DeviceV2',
  };

  get availableMethodItems(): readonly DeviceUicMethod[] {
    return this.device?.config.mode === 'bbp2'
      ? [this.automaticMethod, ...this.methodItems]
      : this.methodItems;
  }

  device?: BlinkerDevice;
  saving = false;

  private readonly subscriptions = new Subscription();
  private confirmationAlert?: HTMLIonAlertElement;

  constructor(
    route: ActivatedRoute,
    private readonly navController: NavController,
    private readonly alertController: AlertController,
    private readonly dataService: DataService,
    private readonly deviceService: DeviceService,
    private readonly noticeService: NoticeService,
  ) {
    this.id = route.snapshot.paramMap.get('id') || '';
    this.backHref = this.id
      ? `/device-manager/${this.id}`
      : '/home/device';
    this.methodItems = [
      {
        id: 'ai',
        icon: 'fa-wand-magic-sparkles',
        iconColor: 'var(--ion-color-primary)',
        title: 'AI生成界面',
        description: '描述你的控制需求，由 AI 帮你生成设备界面',
        componentName: 'Customizer',
      },
      {
        id: 'classic',
        icon: 'fa-grid-4',
        iconColor: 'var(--ion-color-secondary)',
        title: '拖拽编辑器（经典版）',
        description: '自由添加、排列和配置控制组件',
        componentName: 'Layouter2Component',
      },
      {
        id: 'debug',
        icon: 'fa-terminal',
        iconColor: 'var(--ion-color-warning)',
        title: '调试工具界面',
        description: '查看设备数据，并使用调试指令验证功能',
        componentName: 'TestDashboard',
      },
    ];
  }

  ngOnInit(): void {
    this.bindDevice();
    this.subscriptions.add(
      this.dataService.userDataLoader.subscribe((loaded) => {
        if (loaded) this.bindDevice();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    void this.confirmationAlert?.dismiss();
  }

  async selectMethod(method: MenuListItem): Promise<void> {
    const selectedMethod = this.availableMethodItems.find(
      (item) => item.id === method.id,
    );
    if (!selectedMethod || this.saving) return;

    this.confirmationAlert = await this.alertController.create({
      header: `确定使用${selectedMethod.title}？`,
      message: '确认后将修改当前设备使用的界面组件。',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: () => this.applyMethod(selectedMethod),
        },
      ],
    });
    await this.confirmationAlert.present();
  }

  private async applyMethod(method: DeviceUicMethod): Promise<void> {
    if (!this.device || this.saving) {
      if (!this.device) {
        await this.noticeService.showToast('未找到当前设备，请稍后重试');
      }
      return;
    }

    this.saving = true;
    try {
      const saved = this.device.config.isPreview
        ? true
        : await this.deviceService.saveDeviceConfig(this.device, {
            component: method.componentName,
          });

      if (!saved) {
        await this.noticeService.showToast('界面配置保存失败，请稍后重试');
        return;
      }

      this.device.config.component = method.componentName;
      this.device.subject?.next({
        key: 'component',
        value: method.componentName,
        source: 'device-uic',
      });
      await this.noticeService.showToast('界面配置已更新');
      await this.navController.navigateRoot(`/device/${this.id}`);
    } catch {
      await this.noticeService.showToast('界面配置保存失败，请稍后重试');
    } finally {
      this.saving = false;
    }
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
  }
}
