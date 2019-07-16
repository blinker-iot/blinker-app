import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { Layout2Page } from './layout2';
import { GridsterModule } from 'angular-gridster2';
import { ComponentsModule } from '../../components/components.module';

import { DynamicModule } from 'ng-dynamic-component';
import { Layout2textComponent } from '../../components/layout2text/layout2text';
import { Layout2numberComponent } from '../../components/layout2number/layout2number';
import { Layout2buttonComponent } from '../../components/layout2button/layout2button';
import { Layout2colorComponent } from '../../components/layout2color/layout2color';
import { Layout2rangeComponent } from '../../components/layout2range/layout2range';
import { Layout2chartComponent } from '../../components/layout2chart/layout2chart';
import { Layout2joystickComponent } from '../../components/layout2joystick/layout2joystick';
import { Layout2videoComponent } from '../../components/layout2video/layout2video';
import { Layout2timerComponent } from '../../components/layout2timer/layout2timer';
import { Layout2debugComponent } from '../../components/layout2debug/layout2debug';

@NgModule({
  declarations: [
    Layout2Page,
  ],
  imports: [
    IonicPageModule.forChild(Layout2Page),
    GridsterModule,
    ComponentsModule,
    DynamicModule.withComponents([
      Layout2textComponent,
      Layout2numberComponent,
      Layout2buttonComponent,
      Layout2colorComponent,
      Layout2rangeComponent,
      Layout2chartComponent,
      Layout2joystickComponent,
      Layout2debugComponent,
      Layout2timerComponent,
      Layout2videoComponent
    ])
  ],
})
export class Layout2PageModule { }
