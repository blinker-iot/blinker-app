import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnPlugAddTimingPage } from './own-plug-add-timing';
import { ComponentsModule } from '../../../../components/components.module';

@NgModule({
  declarations: [
    OwnPlugAddTimingPage,
  ],
  imports: [
    IonicPageModule.forChild(OwnPlugAddTimingPage),
    ComponentsModule
  ],
})
export class OwnPlugAddTimingPageModule {}
