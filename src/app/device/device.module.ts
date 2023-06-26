import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DevicePage } from './device.page';
import { Layouter2Module } from './layouter2/layouter2.module';
import { BlinkerTimerModule } from 'src/app/sections/timer/timer.module';
import { Customizer } from './customizer/customizer.component';
import { TranslateModule } from '@ngx-translate/core';
import { LayouterGuard } from './layouter2/layouter.guard';
import { DirectivesModule } from '../core/directives/directives.module';
import { DeviceTemplateModule } from './template/template.module';

const routes: Routes = [
  {
    path: 'device',
    children: [
      { path: ':id', component: DevicePage, canDeactivate: [LayouterGuard] }
    ]
  }
];

@NgModule({
  declarations: [DevicePage, Customizer],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    BlinkerTimerModule,
    Layouter2Module,
    DeviceTemplateModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
})
export class BlinkerDeviceModule { }
