import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { Layout2TimerEdittimingPage } from './layout2-timer-edittiming';
import { ComponentsModule } from '../../components/components.module';

@NgModule({
  declarations: [
    Layout2TimerEdittimingPage,
  ],
  imports: [
    IonicPageModule.forChild(Layout2TimerEdittimingPage),
    ComponentsModule
  ],
})
export class Layout2TimerEdittimingPageModule {}
