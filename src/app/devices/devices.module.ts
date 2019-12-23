import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OwnAirdetectorModule } from './own/own-airdetector/own-airdetector.module';
import { OwnAirStationModule } from './own/own-airstation/own-airstation.module';
import { OwnPlugModule } from './own/own-plug/own-plug.module';
import { OwnLightModule } from './own/own-light/own-light.module';
import { OwnSensorModule } from './own/own-sensor/own-sensor.module';
import { Qianhong960eModule } from './qianhong/qianhong-960e/qianhong-960e.module';

@NgModule({
  declarations: [
  ],
  imports: [
    CommonModule,
    OwnAirdetectorModule,
    OwnAirStationModule,
    OwnPlugModule,
    OwnLightModule,
    OwnSensorModule,
    Qianhong960eModule
  ],
  entryComponents:[
    
  ]
})
export class DevicesModule { }
