import { NgModule } from '@angular/core';

import { OwnLighttDashboardPage } from './own-lightt-dashboard';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ComponentsModule } from 'src/app/core/components/components.module';

@NgModule({
  declarations: [
    OwnLighttDashboardPage,
  ],
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule
  ],
})
export class OwnLighttDashboardPageModule {}
