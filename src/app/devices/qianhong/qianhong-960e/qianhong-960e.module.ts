import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { Qianhong960eDashboard } from './qianhong-960e-dashboard/qianhong-960e-dashboard';
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
    Qianhong960eDashboard
  ],
  exports: [
    Qianhong960eDashboard
  ],
  entryComponents: [
    Qianhong960eDashboard
  ]
})

export class Qianhong960eModule { }