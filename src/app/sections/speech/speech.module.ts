import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { SpeechPage } from './speech';
import { SpeechService } from './speech.service';
import { SpeechButtonComponent } from './speech-button/speech-button';

const routes: Routes = [
  {
    path: 'speech',
    component: SpeechPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  providers: [SpeechService],
  declarations: [SpeechPage, SpeechButtonComponent],
  exports: [SpeechPage, SpeechButtonComponent],
  entryComponents: [SpeechPage]
})
export class BlinkerSpeechModule { }
