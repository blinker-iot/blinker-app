import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { Layout2TimerPage } from './layout2-timer';
import { PipesModule } from '../../pipes/pipes.module';
import { ComponentsModule } from '../../components/components.module';

@NgModule({
  declarations: [
    Layout2TimerPage,
  ],
  imports: [
    IonicPageModule.forChild(Layout2TimerPage),
    PipesModule,
    ComponentsModule
  ],
})
export class Layout2TimerPageModule {}
