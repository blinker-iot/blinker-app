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
  selector: 'app-wifi-device-guide',
  templateUrl: './wifi-device.page.html',
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
export class WifiDeviceGuidePage {
  constructor(private navController: NavController) {}

  async startProvisioning(): Promise<void> {
    await this.navController.navigateForward('/tools/esp32-provision');
  }
}
