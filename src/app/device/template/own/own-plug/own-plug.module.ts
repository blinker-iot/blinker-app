import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { OwnPlugDashboard } from './own-plug-dashboard/own-plug-dashboard';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { ComponentsModule } from 'src/app/core/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ComponentsModule,
    PipesModule
  ],
  declarations: [
    OwnPlugDashboard
  ],
  exports: [
    OwnPlugDashboard
  ]
})

export class OwnPlugModule { }