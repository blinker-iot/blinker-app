import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnLightGuidePage } from './own-light-guide';

@NgModule({
  declarations: [
    OwnLightGuidePage,
  ],
  imports: [
    IonicPageModule.forChild(OwnLightGuidePage),
  ],
})
export class OwnLightGuidePageModule {}
