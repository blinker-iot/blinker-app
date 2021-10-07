import { Component, OnInit } from '@angular/core';
import { CONFIG } from 'src/app/configs/app.config';
import { ModalController } from '@ionic/angular';
import { DocPage } from 'src/app/core/pages/doc/doc.page';

@Component({
  selector: 'blinker-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
})
export class AboutPage implements OnInit {

  LOGO = CONFIG.LOGIN_LOGO;
  TELEPHONE = CONFIG.TELEPHONE;
  ABOUT_US = CONFIG.ABOUT_US;
  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;
  
  constructor(
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {
  }

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
