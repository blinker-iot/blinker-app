import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DashboardAddblockPage } from './dashboard-addblock';

const routes: Routes = [
  {
    path: '',
    component: DashboardAddblockPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [DashboardAddblockPage]
})
export class DashboardAddblockPageModule {}
