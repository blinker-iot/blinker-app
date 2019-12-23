import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { EditinfoPage } from './editinfo.page';
import { devCenterComponentsModule } from '../../components/components.module';

const routes: Routes = [
  {
    path: '',
    component: EditinfoPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    devCenterComponentsModule,
    RouterModule.forChild(routes)
  ],
  declarations: [EditinfoPage]
})
export class EditinfoPageModule {}
