import { Component, ViewChild, ElementRef } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { SpeechPage } from 'src/app/sections/speech/speech';
import { SpeechService } from '../speech.service';

@Component({
  selector: 'speech-button',
  templateUrl: 'speech-button.html',
  styleUrls: ['speech-button.scss'],
})
export class SpeechButtonComponent {

  @ViewChild("speechAudio", { read: ElementRef, static: true }) speechAudio: ElementRef;

  constructor(
    private modalCtrl: ModalController,
    private speechService: SpeechService
  ) { }

  ngAfterViewInit() {
    this.speechService.playAudio.subscribe(audioName => {
      this.play(audioName)
    });
  }

  async speech() {
    const modal = await this.modalCtrl.create({
      component: SpeechPage,
      backdropDismiss: false,
    });
    modal.present();
  }

  play(audioName) {
    this.speechAudio.nativeElement.src = `assets/aac/Speech_${audioName}.aac`;
    this.speechAudio.nativeElement.play();
  }

}
