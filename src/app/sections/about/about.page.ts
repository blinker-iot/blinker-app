import { Component } from '@angular/core';
import { CONFIG } from 'src/app/configs/app.config';
import { IonicModule, ModalController } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { DocPage } from 'src/app/core/pages/doc/doc.page';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';

@Component({
    selector: 'app-about',
    standalone: true,
    templateUrl: './about.page.html',
    styleUrls: ['./about.page.scss'],
    imports: [IonicModule, TranslatePipe, HeroCardComponent],
})
export class AboutPage {

  LOGO = CONFIG.LOGIN_LOGO;
  TELEPHONE = CONFIG.TELEPHONE;
  ABOUT_US = CONFIG.ABOUT_US;
  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;

  constructor(
    private modalCtrl: ModalController
  ) { }

  async openUrl(url, title) {
    // let browser = this.iab.create(url, '_system', 'location=no,hidden=no');
    const modal = await this.modalCtrl.create({
      component: DocPage,
      backdropDismiss: false,
      componentProps: {
        'docTitle': title,
        'docUrl': url,
      }
    });
    modal.present();
  }

}
