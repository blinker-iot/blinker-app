import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AddDevicePage } from './adddevice';
import { AdddeviceService } from './adddevice.service';

const routes: Routes = [
  {
    path: 'adddevice',
    children: [
      { path: '', component: AddDevicePage, },
      { path: ':deviceType', loadChildren: './guide/guide.module#GuidePageModule' },
      { path: ':deviceType/espTouch', loadChildren: './esptouch/esptouch.module#EsptouchPageModule' },
      { path: ':deviceType/bleConfig', loadChildren: './bwconfig/bwconfig.module#BwconfigPageModule' },
      { path: ':deviceType/apConfig', loadChildren: './apconfig/apconfig.module#ApconfigPageModule' },
      { path: ':deviceType/KeyConfig', loadChildren: './mqttkey/mqttkey.module#MqttkeyPageModule' },
      { path: ':deviceType/qrscanner', loadChildren: './qrscanner/qrscanner.module#QrscannerPageModule' }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  providers: [AdddeviceService],
  declarations: [AddDevicePage]
})
export class BlinkerAddDeviceModule { }
