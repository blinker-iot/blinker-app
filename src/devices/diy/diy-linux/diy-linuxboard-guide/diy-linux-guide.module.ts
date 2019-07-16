import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { DiyLinuxGuidePage } from './diy-linux-guide';

@NgModule({
  declarations: [
    DiyLinuxGuidePage,
  ],
  imports: [
    IonicPageModule.forChild(DiyLinuxGuidePage),
  ],
})
export class DiyLinuxGuidePageModule {}
