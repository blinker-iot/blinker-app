import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnLightDashboardPage } from './own-light-dashboard';

@NgModule({
  declarations: [
    OwnLightDashboardPage,
  ],
  imports: [
    IonicPageModule.forChild(OwnLightDashboardPage),
  ],
})
export class OwnLightDashboardPageModule {}
