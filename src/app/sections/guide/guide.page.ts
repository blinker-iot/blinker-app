import { ChangeDetectionStrategy, Component } from '@angular/core';

import { IonicModule, NavController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  MenuListComponent,
  MenuListItem,
} from '../../core/components/menu-list/menu-list';

@Component({
  selector: 'app-device-guide',
  templateUrl: './guide.page.html',
  styleUrls: ['./guide.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, TranslatePipe, MenuListComponent],
})
export class GuidePage {
  constructor(
    private navController: NavController,
    private translate: TranslateService
  ) {}

  get methodItems(): readonly MenuListItem[] {
    return [
      {
        id: 'wifi',
        icon: 'fa-wifi',
        iconColor: 'var(--ion-color-primary)',
        title: this.translate.instant('DEVICE_GUIDE.WIFI_TITLE'),
        description: this.translate.instant('DEVICE_GUIDE.WIFI_DESCRIPTION'),
        route: '/guide/wifi',
      },
      {
        id: 'ble',
        icon: 'fa-bluetooth',
        iconColor: 'var(--ion-color-secondary)',
        title: this.translate.instant('DEVICE_GUIDE.BLE_TITLE'),
        description: this.translate.instant('DEVICE_GUIDE.BLE_DESCRIPTION'),
        route: '/guide/ble',
      },
      {
        id: 'key',
        icon: 'fa-key',
        iconColor: 'var(--ion-color-warning)',
        title: this.translate.instant('DEVICE_GUIDE.KEY_METHOD_TITLE'),
        description: this.translate.instant(
          'DEVICE_GUIDE.KEY_METHOD_DESCRIPTION'
        ),
        route: '/guide/key',
      },
    ];
  }

  async selectMethod(method: MenuListItem): Promise<void> {
    if (!method.route) return;
    await this.navController.navigateForward(method.route);
  }

}
