import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Deviceblock } from './deviceblock/deviceblock';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../pipes/pipes.module';
import { SceneButtonComponent } from './scene-button/scene-button';
import { SceneButtonGroupComponent } from './scene-button-group/scene-button-group';
import { BItemComponent } from './b-item/b-item';
import { DeviceblockList2Component } from './deviceblock-list2/deviceblock-list2';
import { DeviceblockListComponent } from './deviceblock-list/deviceblock-list';
import { BRangeComponent } from './b-range/b-range';
import { BColorpickerComponent } from './b-colorpicker/b-colorpicker';
import { RoomMenuComponent } from './room-menu/room-menu';
import { DevicebarComponent } from './devicebar/devicebar.component';
import { BColorpickerBtnsComponent } from './b-colorpicker-btns/b-colorpicker-btns.component';
import { BTimepickerComponent } from './b-timepicker/b-timepicker.component';
import { BProgressbarComponent } from './b-progressbar/b-progressbar.component';
import { BColorpickerDiscComponent } from './b-colorpicker-disc/b-colorpicker-disc.component';
import { InputBoxComponent } from './input-box/input-box.component';
import { FormsModule } from '@angular/forms';
import { BChartComponent } from './b-chart/b-chart.component';

@NgModule({
  declarations: [
    Deviceblock,
    SceneButtonComponent,
    SceneButtonGroupComponent,
    BItemComponent,
    DeviceblockList2Component,
    DeviceblockListComponent,
    BRangeComponent,
    BColorpickerComponent,
    RoomMenuComponent,
    DevicebarComponent,
    BColorpickerBtnsComponent,
    BTimepickerComponent,
    BProgressbarComponent,
    BColorpickerDiscComponent,
    InputBoxComponent,
    BChartComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    FormsModule
  ],
  exports: [
    Deviceblock,
    PipesModule,
    SceneButtonComponent,
    SceneButtonGroupComponent,
    BItemComponent,
    DeviceblockList2Component,
    DeviceblockListComponent,
    BRangeComponent,
    BColorpickerComponent,
    BColorpickerBtnsComponent,
    RoomMenuComponent,
    DevicebarComponent,
    BTimepickerComponent,
    BProgressbarComponent,
    BColorpickerDiscComponent,
    BChartComponent,
  ],
  entryComponents: [
    InputBoxComponent
  ]
})
export class ComponentsModule { }
