import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MiScaleDashboardPage } from './mi-scale-dashboard';

@NgModule({
  declarations: [
    MiScaleDashboardPage,
  ],
  imports: [
    IonicPageModule.forChild(MiScaleDashboardPage),
  ],
})
export class MiScaleDashboardPageModule {}
