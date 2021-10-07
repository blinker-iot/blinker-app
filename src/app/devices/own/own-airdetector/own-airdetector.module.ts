import { NgModule } from '@angular/core';
import { OwnAirdetectorDashboard } from './own-airdetector-dashboard/own-airdetector-dashboard';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { OwnAirdetectorChartPage } from './own-airdetector-chart/own-airdetector-chart';

// const routes: Routes = [
//   {
//     path: 'device/:deviceName/history',
//     component: OwnAirdetectorChartPage,
//   }
// ];

@NgModule({
  declarations: [
    OwnAirdetectorDashboard,
    OwnAirdetectorChartPage
  ],
  imports: [
    CommonModule,
    IonicModule,
    // RouterModule.forChild(routes)
  ],
  exports: [OwnAirdetectorDashboard, OwnAirdetectorChartPage]
})
export class OwnAirdetectorModule { }
