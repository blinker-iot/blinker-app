import { Component, ViewChild, ElementRef } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AudioService } from 'src/app/core/services/audio.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { SpeechPage } from 'src/app/sections/speech/speech';
import { SpeechService } from '../speech.service';

@Component({
  selector: 'speech-button',
  templateUrl: 'speech-button.html',
  styleUrls: ['speech-button.scss'],
})
export class SpeechButtonComponent {

  constructor(
    private modalCtrl: ModalController,
    private dataService: DataService,
    private noticeService: NoticeService,
  ) { }

  async speech() {
    if ((!this.dataService.isAdvancedDeveloper) && (!this.dataService.hasProDevice)) {
      this.noticeService.showToast('该功能仅限点灯专业版使用')
      return
    }
    const modal = await this.modalCtrl.create({
      component: SpeechPage,
      backdropDismiss: false,
    });
    modal.present();
  }

}
