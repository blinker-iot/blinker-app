import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { SpeechPage } from './speech';
import { SpeechService } from './speech.service';
import { SpeechButtonComponent } from './speech-button/speech-button';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslatePipe } from '@ngx-translate/core';

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
    RouterModule.forChild(routes),
    DirectivesModule,
    TranslatePipe,
    SpeechPage,
    SpeechButtonComponent
  ],
  providers: [SpeechService],
  exports: [SpeechPage, SpeechButtonComponent]
})
export class BlinkerSpeechModule { }
