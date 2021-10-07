import { NgModule } from '@angular/core';

import { OwnLight1Dashboard } from './own-light1-dashboard/own-light1-dashboard';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ComponentsModule } from 'src/app/core/components/components.module';

@NgModule({
  declarations: [
    OwnLight1Dashboard,
  ],
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule
  ],
  exports: [
    OwnLight1Dashboard
  ]
})
export class OwnLight1Module { }
