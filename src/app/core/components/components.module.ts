import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Deviceblock } from './deviceblock/deviceblock';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../pipes/pipes.module';
import { SceneButtonGroupComponent } from './scene-button-group/scene-button-group';
import { DeviceblockList2Component } from './deviceblock-list2/deviceblock-list2';
import { DeviceblockListComponent } from './deviceblock-list/deviceblock-list';
import { BRangeComponent } from './b-range/b-range';
import { BColorpickerComponent } from './b-colorpicker/b-colorpicker';
import { BColorpickerBtnsComponent } from './b-colorpicker-btns/b-colorpicker-btns.component';
import { BTimepickerComponent } from './b-timepicker/b-timepicker.component';
import { BProgressbarComponent } from './b-progressbar/b-progressbar.component';
import { BColorpickerDiscComponent } from './b-colorpicker-disc/b-colorpicker-disc.component';
import { InputBoxComponent } from './input-box/input-box.component';
import { FormsModule } from '@angular/forms';
import { BChartComponent } from './b-chart/b-chart.component';
import { BDeviceImgComponent } from './b-device-img/b-device-img.component';

import { BToggleComponent } from './b-toggle/b-toggle.component';
import { BBottomBtnComponent } from './b-bottom-btn/b-bottom-btn.component';
import { BTopBoxComponent } from './b-top-box/b-top-box.component';
import { BDeviceListComponent } from './b-device-list/b-device-list.component';
import { BToastComponent } from './b-toast/b-toast.component';
import { BTipComponent } from './b-tip/b-tip.component';
import { LangSelectorComponent } from './lang-selector/lang-selector.component';
import { BItemListComponent } from './b-item-list/b-item-list.component';
import { BItemComponent } from './b-item-list/b-item/b-item';
import { SceneButtonComponent } from './scene-button-group/scene-button/scene-button';

@NgModule({
  declarations: [
    Deviceblock,
    SceneButtonGroupComponent,
    BItemListComponent,
    BItemComponent,
    DeviceblockList2Component,
    DeviceblockListComponent,
    BRangeComponent,
    BColorpickerComponent,
    BColorpickerBtnsComponent,
    BTimepickerComponent,
    BProgressbarComponent,
    BColorpickerDiscComponent,
    InputBoxComponent,
    BChartComponent,
    BDeviceImgComponent,
    BBottomBtnComponent,
    BToggleComponent,
    BTopBoxComponent,
    BDeviceListComponent,
    BToastComponent,
    BTipComponent,
    LangSelectorComponent,
    SceneButtonComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    FormsModule,
  ],
  exports: [
    Deviceblock,
    PipesModule,
    SceneButtonComponent,
    SceneButtonGroupComponent,
    BItemComponent,
    BItemListComponent,
    DeviceblockList2Component,
    DeviceblockListComponent,
    BRangeComponent,
    BColorpickerComponent,
    BColorpickerBtnsComponent,
    BTimepickerComponent,
    BProgressbarComponent,
    BColorpickerDiscComponent,
    BChartComponent,
    BDeviceImgComponent,
    BBottomBtnComponent,
    BToggleComponent,
    BTopBoxComponent,
    BDeviceListComponent,
    BToastComponent,
    BTipComponent,
    LangSelectorComponent
  ]
})
export class ComponentsModule { }
