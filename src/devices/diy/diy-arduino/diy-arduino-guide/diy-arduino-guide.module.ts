import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { DiyArduinoGuidePage } from './diy-arduino-guide';

@NgModule({
  declarations: [
    DiyArduinoGuidePage,
  ],
  imports: [
    IonicPageModule.forChild(DiyArduinoGuidePage),
  ],
})
export class DiyArduinoGuidePageModule {}
