import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnPlugGuidePage } from './own-plug-guide';

@NgModule({
  declarations: [
    OwnPlugGuidePage,
  ],
  imports: [
    IonicPageModule.forChild(OwnPlugGuidePage),
  ],
})
export class OwnPlugGuidePageModule { }
