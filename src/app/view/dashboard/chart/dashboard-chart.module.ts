import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DashboardChartPage } from './dashboard-chart';

const routes: Routes = [
  {
    path: '',
    component: DashboardChartPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [DashboardChartPage]
})
export class DashboardChartPageModule {}
