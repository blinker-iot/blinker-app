import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OwnAirdetectorModule } from './own/own-airdetector/own-airdetector.module';
import { OwnAirStationModule } from './own/own-airstation/own-airstation.module';
import { OwnPlugModule } from './own/own-plug/own-plug.module';
import { OwnLightModule } from './own/own-light/own-light.module';
import { OwnSensorModule } from './own/own-sensor/own-sensor.module';
import { OwnLight1Module } from './own/own-light1/own-light1-dashboard.module';

@NgModule({
  declarations: [
  ],
  imports: [
    CommonModule,
    OwnAirdetectorModule,
    OwnAirStationModule,
    OwnPlugModule,
    OwnLightModule,
    OwnLight1Module,
    OwnSensorModule,
  ]
})
export class DevicesModule { }
