import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { EsptouchPage } from './esptouch';
import { ConfigStatePageModule } from './config-state/config-state.module';

const routes: Routes = [
  {
    path: '',
    component: EsptouchPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ConfigStatePageModule,
    RouterModule.forChild(routes)
  ],
  declarations: [EsptouchPage]
})
export class EsptouchPageModule {}
