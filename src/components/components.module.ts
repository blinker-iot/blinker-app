import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Deviceblock } from './deviceblock/deviceblock';
import { IonicModule } from 'ionic-angular';
import { Weatherblock } from './weatherblock/weatherblock';
import { PipesModule } from '../pipes/pipes.module';
import { SpeechButtonComponent } from './speech-button/speech-button';
import { SceneButtonComponent } from './scene-button/scene-button';
import { SceneButtonGroupComponent } from './scene-button-group/scene-button-group';
import { BItemComponent } from './b-item/b-item';
import { DynamicModule } from 'ng-dynamic-component';
import { Layout2textComponent } from './layout2text/layout2text';
import { Layout2buttonComponent } from './layout2button/layout2button';
import { Layout2numberComponent } from './layout2number/layout2number';
import { Layout2colorComponent } from './layout2color/layout2color';
import { Layout2rangeComponent } from './layout2range/layout2range';
import { Layout2chartComponent } from './layout2chart/layout2chart';
import { Layout2joystickComponent } from './layout2joystick/layout2joystick';
import { Layout2debugComponent } from './layout2debug/layout2debug';
import { Layout2timerComponent } from './layout2timer/layout2timer';
import { Layout2videoComponent } from './layout2video/layout2video';
import { BSliderComponent } from './b-slider/b-slider';
// import { NgxGaugeModule } from 'ngx-gauge';
import { Layout2buttonListComponent } from './layout2button-list/layout2button-list';
import { TimePickerComponent } from './time-picker/time-picker';
import { DeviceblockListComponent } from './deviceblock-list/deviceblock-list';
import { CountdownComponent } from './countdown/countdown';
import { LoopComponent } from './loop/loop';
import { TimingComponent } from './timing/timing';
import { GaugeModule } from 'angular-gauge';
import { RoomListComponent } from './room-list/room-list';
import { DeviceblockHomelistComponent } from './deviceblock-homelist/deviceblock-homelist';

@NgModule({
  declarations: [
    Deviceblock,
    Weatherblock,
    SpeechButtonComponent,
    SceneButtonComponent,
    SceneButtonGroupComponent,
    BItemComponent,
    Layout2textComponent,
    Layout2buttonComponent,
    Layout2numberComponent,
    Layout2colorComponent,
    Layout2rangeComponent,
    Layout2chartComponent,
    Layout2joystickComponent,
    Layout2debugComponent,
    Layout2timerComponent,
    Layout2videoComponent,
    BSliderComponent,
    Layout2buttonListComponent,
    TimePickerComponent,
    DeviceblockListComponent,
    CountdownComponent,
    LoopComponent,
    TimingComponent,
    RoomListComponent,
    DeviceblockHomelistComponent,
  ],
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    GaugeModule.forRoot(),
    DynamicModule.withComponents([
      Layout2textComponent,
      Layout2numberComponent,
      Layout2buttonComponent,
      Layout2colorComponent,
      Layout2rangeComponent,
      Layout2chartComponent,
      Layout2joystickComponent,
    ])
  ],
  exports: [
    Deviceblock,
    Weatherblock,
    PipesModule,
    SpeechButtonComponent,
    SceneButtonComponent,
    SceneButtonGroupComponent,
    BItemComponent,
    Layout2textComponent,
    Layout2buttonComponent,
    Layout2numberComponent,
    Layout2colorComponent,
    Layout2rangeComponent,
    Layout2chartComponent,
    Layout2joystickComponent,
    Layout2debugComponent,
    Layout2timerComponent,
    Layout2videoComponent,
    BSliderComponent,
    Layout2buttonListComponent,
    TimePickerComponent,
    DeviceblockListComponent,
    CountdownComponent,
    LoopComponent,
    TimingComponent,
    RoomListComponent,
    DeviceblockHomelistComponent,
  ],
  entryComponents: [
    Deviceblock,
    Weatherblock,
    Layout2textComponent,
    Layout2buttonComponent,
    Layout2numberComponent,
    Layout2colorComponent,
    Layout2rangeComponent,
    Layout2chartComponent,
    Layout2joystickComponent,
  ]
})
export class ComponentsModule { }
