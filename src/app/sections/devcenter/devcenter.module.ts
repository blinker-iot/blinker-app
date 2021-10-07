import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DevcenterPage } from './devcenter.page';
import { devCenterComponentsModule } from './components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
import { ComponentsModule } from 'src/app/core/components/components.module';

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
      { path: 'tool/esptouch', loadChildren: '../adddevice/esptouch/esptouch.module#EsptouchPageModule' },
      { path: 'tool/apconfig', loadChildren: '../adddevice/apconfig/apconfig.module#ApconfigPageModule' },
      { path: 'tool/qrscanner', loadChildren: '../adddevice/qrscanner/qrscanner.module#QrscannerPageModule' },
      { path: 'tool/bleconfig', loadChildren: '../adddevice/bleconfig/bleconfig.module#BleconfigModule' }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    devCenterComponentsModule,
    DirectivesModule,
    ComponentsModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [DevcenterPage]
})
export class BlinkerDevCenterModule { }
