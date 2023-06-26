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
      { path: 'qrscanner', loadChildren: () => import('./qrscanner/qrscanner.module').then(m => m.QrscannerPageModule) },
      { path: ':deviceType', loadChildren: () => import('./guide/guide.module').then(m => m.GuidePageModule) },
      { path: ':deviceType/espTouch', loadChildren: () => import('./esptouch/esptouch.module').then(m => m.EsptouchPageModule) },
      { path: ':deviceType/espTouchV2', loadChildren: () => import('./esptouch/esptouch.module').then(m => m.EsptouchPageModule) },
      { path: ':deviceType/bleConfig', loadChildren: () => import('./bwconfig/bwconfig.module').then(m => m.BwconfigPageModule) },
      { path: ':deviceType/apConfig', loadChildren: () => import('./apconfig/apconfig.module').then(m => m.ApconfigPageModule) },
      { path: ':deviceType/KeyConfig', loadChildren: () => import('./mqttkey/mqttkey.module').then(m => m.MqttkeyPageModule) },
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
