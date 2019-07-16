import { Component } from '@angular/core';
import { ModalController } from 'ionic-angular';

@Component({
  selector: 'speech-button',
  templateUrl: 'speech-button.html'
})
export class SpeechButtonComponent {

  constructor(
    public modalCtrl: ModalController
  ) { }

  speech() {
    let modal = this.modalCtrl.create('SpeechPage');
    modal.present();
  }

}
