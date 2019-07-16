import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MqttkeyPage } from './mqttkey';

@NgModule({
  declarations: [
    MqttkeyPage,
  ],
  imports: [
    IonicPageModule.forChild(MqttkeyPage),
  ],
})
export class MqttkeyPageModule {}
