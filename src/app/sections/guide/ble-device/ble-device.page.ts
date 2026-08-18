import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';

@Component({
  selector: 'app-ble-device-guide',
  templateUrl: './ble-device.page.html',
  styleUrls: ['../connection-method.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    TranslatePipe,
    HeroCardComponent,
  ],
})
export class BleDeviceGuidePage {
  constructor(private navController: NavController) {}

  async startDiscovery(): Promise<void> {
    await this.navController.navigateForward('/tools/ble-debug');
  }
}
