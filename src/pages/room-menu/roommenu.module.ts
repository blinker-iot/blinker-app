import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { RoommenuPage } from './roommenu';

@NgModule({
  declarations: [
    RoommenuPage,
  ],
  imports: [
    IonicPageModule.forChild(RoommenuPage),
  ],
})
export class RoommenuPageModule {}
