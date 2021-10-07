import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AddDevicePage } from './adddevice';
import { AdddeviceService } from './adddevice.service';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  {
    path: 'adddevice',
    children: [
      { path: '', component: AddDevicePage, },
      { path: 'qrscanner', loadChildren: './qrscanner/qrscanner.module#QrscannerPageModule' },
      { path: ':deviceType', loadChildren: './guide/guide.module#GuidePageModule' },
      { path: ':deviceType/espTouch', loadChildren: './esptouch/esptouch.module#EsptouchPageModule' },
      { path: ':deviceType/bleConfig', loadChildren: './bwconfig/bwconfig.module#BwconfigPageModule' },
      { path: ':deviceType/apConfig', loadChildren: './apconfig/apconfig.module#ApconfigPageModule' },
      { path: ':deviceType/KeyConfig', loadChildren: './mqttkey/mqttkey.module#MqttkeyPageModule' },
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  providers: [AdddeviceService],
  declarations: [AddDevicePage]
})
export class BlinkerAddDeviceModule { }
