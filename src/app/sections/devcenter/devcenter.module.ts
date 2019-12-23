import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DevcenterPage } from './devcenter.page';
import { devCenterComponentsModule } from './components/components.module';
import { DeviceIconPage } from '../../core/pages/device-icon/device-icon';

declare var window;
window.hasDevCenterModule = true;

const routes: Routes = [
  {
    path: 'devcenter',
    children: [
      { path: '', component: DevcenterPage },
      { path: 'prodevice/add', loadChildren: './pages/addprodevice/addprodevice.module#AddprodevicePageModule' },
      { path: 'prodevice/:deviceType', loadChildren: './pages/settings/settings.module#SettingsPageModule' },
      { path: 'prodevice/editlayouter/:deviceType', loadChildren: './pages/editlayouter/editlayouter.module#EditlayouterPageModule' },
      { path: 'prodevice/editlayouter/ieconfig/:deviceType', loadChildren: './pages/editlayouter/ieconfig/ieconfig.module#IeconfigPageModule' },
      { path: 'prodevice/editinfo/:deviceType', loadChildren: './pages/editinfo/editinfo.module#EditinfoPageModule' },
      { path: 'prodevice/public/:deviceType', loadChildren: './pages/publicprodevice/publicprodevice.module#PublicprodevicePageModule' },
      { path: 'prodevice/editspeech/:deviceType', loadChildren: './pages/editspeech/editspeech.module#EditspeechPageModule' },
      { path: 'prodevice/edittimer/:deviceType', loadChildren: './pages/edittimer/edittimer.module#EdittimerPageModule' },
      { path: 'tool/esptouch', loadChildren: '../adddevice/esptouch/esptouch.module#EsptouchPageModule' },
      { path: 'tool/apconfig', loadChildren: '../adddevice/apconfig/apconfig.module#ApconfigPageModule' },
      { path: 'tool/qrscanner', loadChildren: '../adddevice/qrscanner/qrscanner.module#QrscannerPageModule' }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    devCenterComponentsModule,
    RouterModule.forChild(routes)
  ],
  declarations: [DevcenterPage]
})
export class BlinkerDevCenterModule { }
