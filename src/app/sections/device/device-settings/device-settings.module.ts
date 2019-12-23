import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DeviceSettingsPage } from './device-settings';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { DeviceIconPageModule } from 'src/app/core/pages/device-icon/device-icon.module';

const routes: Routes = [
  { path: "", component: DeviceSettingsPage }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    DeviceIconPageModule,
    RouterModule.forChild(routes)
  ],
  declarations: [
    DeviceSettingsPage,
  ]
})
export class DeviceSettingsPageModule { }

