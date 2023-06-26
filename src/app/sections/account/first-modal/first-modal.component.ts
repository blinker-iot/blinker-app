import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { CONFIG } from 'src/app/configs/app.config';
import { DocPage } from 'src/app/core/pages/doc/doc.page';
import { PusherService } from 'src/app/core/services/pusher.service';

@Component({
  selector: 'blinker-first-modal',
  templateUrl: './first-modal.component.html',
  styleUrls: ['./first-modal.component.scss'],
})
export class FirstModalComponent implements OnInit {

  APP_NAME = CONFIG.NAME
  USER_AGREEMENT = CONFIG.USER_AGREEMENT;
  PRIVACY_POLICY = CONFIG.PRIVACY_POLICY;

  constructor(
    private modalCtrl: ModalController,
    private pusherService: PusherService
  ) { }

  ngOnInit() { }


  exit() {
    navigator['app'].exitApp()
  }

  enter() {
    localStorage.setItem('showFirstModal', '1');
    // this.pusherService.init()
    this.modalCtrl.dismiss();
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
