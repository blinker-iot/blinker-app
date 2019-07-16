import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { EsptouchPage } from './esptouch';

@NgModule({
  declarations: [
    EsptouchPage,
  ],
  imports: [
    IonicPageModule.forChild(EsptouchPage),
  ],
})
export class EsptouchPageModule {}
