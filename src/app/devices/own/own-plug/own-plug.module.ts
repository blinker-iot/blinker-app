import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { OwnPlugDashboard } from './own-plug-dashboard/own-plug-dashboard';
import { TimerComponentsModule } from 'src/app/sections/timer/components/timer-components.module';
import { PipesModule } from 'src/app/core/pipes/pipes.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    TimerComponentsModule,
    PipesModule
  ],
  declarations: [
    OwnPlugDashboard
  ],
  exports: [
    OwnPlugDashboard
  ],
  entryComponents: [
    OwnPlugDashboard
  ]
})

export class OwnPlugModule { }