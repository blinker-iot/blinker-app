import { ChangeDetectionStrategy, Component } from '@angular/core';

import { IonicModule, NavController } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';

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
  readonly isReconfiguration: boolean;
  readonly backHref: string;

  constructor(
    private navController: NavController,
    private translate: TranslateService,
    route: ActivatedRoute
  ) {
    this.isReconfiguration =
      route.snapshot.queryParamMap.get('mode') === 'reconfigure';
    const deviceId = route.snapshot.queryParamMap.get('deviceId');
    this.backHref =
      this.isReconfiguration && deviceId
        ? `/device-manager/${deviceId}`
        : '/home/device';
  }

  get titleKey(): string {
    return this.isReconfiguration
      ? 'DEVICE_GUIDE.RECONFIGURE_TITLE'
      : 'DEVICE_GUIDE.TITLE';
  }

  get eyebrowKey(): string {
    return this.isReconfiguration
      ? 'DEVICE_GUIDE.RECONFIGURE_EYEBROW'
      : 'DEVICE_GUIDE.EYEBROW';
  }

  get heroTitleKey(): string {
    return this.isReconfiguration
      ? 'DEVICE_GUIDE.RECONFIGURE_TITLE'
      : 'DEVICE_GUIDE.HERO_TITLE';
  }

  get heroDescriptionKey(): string {
    return this.isReconfiguration
      ? 'DEVICE_GUIDE.RECONFIGURE_DESCRIPTION'
      : 'DEVICE_GUIDE.HERO_DESCRIPTION';
  }

  get sectionTitleKey(): string {
    return this.isReconfiguration
      ? 'DEVICE_GUIDE.RECONFIGURE_SECTION_TITLE'
      : 'DEVICE_GUIDE.SECTION_TITLE';
  }

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

  get migrationItems(): readonly MenuListItem[] {
    return [
      {
        id: 'old-device',
        icon: 'fa-arrow-down-arrow-up',
        iconColor: 'var(--ion-color-primary)',
        title: this.translate.instant('DEVICE_GUIDE.OLD_DEVICE_ENTRY_TITLE'),
        description: this.translate.instant(
          'DEVICE_GUIDE.OLD_DEVICE_ENTRY_DESCRIPTION'
        ),
        route: '/old-device',
      },
    ];
  }
}
