import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnPlugDashboardPage } from './own-plug-dashboard';
import { PipesModule } from '../../../../pipes/pipes.module';

@NgModule({
  declarations: [
    OwnPlugDashboardPage,
  ],
  imports: [
    IonicPageModule.forChild(OwnPlugDashboardPage),
    PipesModule
  ],
})
export class OwnPlugDashboardPageModule { }
