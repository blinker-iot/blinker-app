import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AddprodevicePage } from './addprodevice.page';
import { DeviceIconPageModule } from 'src/app/core/pages/device-icon/device-icon.module';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  {
    path: '',
    component: AddprodevicePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DeviceIconPageModule,
    ComponentsModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [AddprodevicePage]
})
export class AddprodevicePageModule { }
