import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../pipes/pipes.module';
import { DeviceblockList2Component } from './deviceblock-list2/deviceblock-list2';
import { BColorpickerDiscComponent } from './b-colorpicker-disc/b-colorpicker-disc.component';
import { FormsModule } from '@angular/forms';
import { BDeviceImgComponent } from './b-device-img/b-device-img.component';

import { BBottomBtnComponent } from './b-bottom-btn/b-bottom-btn.component';
import { HeroCardComponent } from './hero-card/hero-card.component';
import { BToastComponent } from './b-toast/b-toast.component';
import { BTipComponent } from './b-tip/b-tip.component';
import { MenuListComponent } from './menu-list/menu-list';
import { MenuItemComponent } from './menu-list/menu-item/menu-item';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    FormsModule,
    MenuListComponent,
    MenuItemComponent,
    DeviceblockList2Component,
    BColorpickerDiscComponent,
    BDeviceImgComponent,
    BBottomBtnComponent,
    HeroCardComponent,
    BToastComponent,
    BTipComponent
  ],
  exports: [
    PipesModule,
    MenuItemComponent,
    MenuListComponent,
    DeviceblockList2Component,
    BColorpickerDiscComponent,
    BDeviceImgComponent,
    BBottomBtnComponent,
    HeroCardComponent,
    BToastComponent,
    BTipComponent,
  ]
})
export class ComponentsModule { }
