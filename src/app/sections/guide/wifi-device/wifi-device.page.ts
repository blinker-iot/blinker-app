import { ChangeDetectionStrategy, Component } from '@angular/core';

import { IonicModule, NavController } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-wifi-device-guide',
  templateUrl: './wifi-device.page.html',
  styleUrls: ['../connection-method.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, TranslatePipe],
})
export class WifiDeviceGuidePage {
  constructor(private navController: NavController) {}

  async startProvisioning(): Promise<void> {
    await this.navController.navigateForward('/tools/esp32-provision');
  }
}
