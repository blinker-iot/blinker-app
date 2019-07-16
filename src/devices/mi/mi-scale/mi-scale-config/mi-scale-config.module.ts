import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MiScaleConfigPage } from './mi-scale-config';

@NgModule({
  declarations: [
    MiScaleConfigPage,
  ],
  imports: [
    IonicPageModule.forChild(MiScaleConfigPage),
  ],
})
export class MiScaleConfigPageModule { }
