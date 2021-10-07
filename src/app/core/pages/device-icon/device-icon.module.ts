import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DeviceIconPage } from './device-icon';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { ComponentsModule } from '../../components/components.module';
import { DirectivesModule } from '../../directives/directives.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    ComponentsModule,
    DirectivesModule
  ],
  declarations: [
    DeviceIconPage,
  ]
})
export class DeviceIconPageModule { }

