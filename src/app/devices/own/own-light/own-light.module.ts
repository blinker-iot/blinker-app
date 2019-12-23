import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { TimerComponentsModule } from 'src/app/sections/timer/components/timer-components.module';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { OwnLightDashboard } from './own-light-dashboard/own-light-dashboard';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { OwnLightSelectcolorPage } from './own-light-selectcolor/own-light-selectcolor';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    TimerComponentsModule,
    ComponentsModule,
    PipesModule
  ],
  declarations: [
    OwnLightDashboard,
    OwnLightSelectcolorPage
  ],
  exports: [
    OwnLightDashboard
  ],
  entryComponents: [
    OwnLightDashboard,
    OwnLightSelectcolorPage
  ]
})

export class OwnLightModule { }