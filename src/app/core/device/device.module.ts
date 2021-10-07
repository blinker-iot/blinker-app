import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DevicePage } from './device.page';
import { Layouter2Module } from './layouter2/layouter2.module';
import { DevicesModule } from 'src/app/devices/devices.module';
import { BlinkerTimerModule } from 'src/app/sections/timer/timer.module';
import { LayouterGuard } from '../guard/layouter.guard';
import { Customizer } from './customizer/customizer.component';
import { DirectivesModule } from '../directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  {
    path: 'device',
    children: [
      { path: ':id', component: DevicePage, canDeactivate: [LayouterGuard] }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    BlinkerTimerModule,
    Layouter2Module,
    DevicesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [DevicePage, Customizer]
})
export class BlinkerDeviceModule { }
