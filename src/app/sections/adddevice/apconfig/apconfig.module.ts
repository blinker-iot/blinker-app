import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { ApconfigPage } from './apconfig';
import { ConfigStatePageModule } from './config-state/config-state.module';

const routes: Routes = [
  {
    path: '',
    component: ApconfigPage
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
  declarations: [ApconfigPage]
})
export class ApconfigPageModule {}
