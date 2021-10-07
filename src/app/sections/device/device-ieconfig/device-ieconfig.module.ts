import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DeviceIeconfigPage } from './device-ieconfig';
import { IeconfigModule } from 'src/app/core/device/layouter2/ieconfig/ieconfig.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  { path: "", component: DeviceIeconfigPage }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    IeconfigModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [
    DeviceIeconfigPage,
  ]
})
export class DeviceIeconfigPageModule { }

