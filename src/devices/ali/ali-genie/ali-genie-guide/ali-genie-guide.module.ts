import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { AliGenieGuidePage } from './ali-genie-guide';

@NgModule({
  declarations: [
    AliGenieGuidePage,
  ],
  imports: [
    IonicPageModule.forChild(AliGenieGuidePage),
  ],
})
export class AliGenieGuidePageModule {}
