import { Component } from '@angular/core';
import { CONFIG } from 'src/app/configs/app.config';

import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { DocPage } from 'src/app/core/pages/doc/doc.page';

@Component({
    selector: 'app-about',
    standalone: true,
    templateUrl: './about.page.html',
    styleUrls: ['./about.page.scss'],
    imports: [
      IonBackButton,
      IonButtons,
      IonContent,
      IonHeader,
      IonTitle,
      IonToolbar,
      TranslatePipe,
    ],
})
export class AboutPage {

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
      cssClass: 'about-document-modal',
      backdropDismiss: false,
      componentProps: {
        'docTitle': title,
        'docUrl': url,
      }
    });
    modal.present();
  }

}
