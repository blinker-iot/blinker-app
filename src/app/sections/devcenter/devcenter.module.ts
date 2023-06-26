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
      { path: 'prodevice/add', loadChildren: () => import('./pages/addprodevice/addprodevice.module').then(m => m.AddprodevicePageModule) },
      { path: 'prodevice/:deviceType', loadChildren: () => import('./pages/settings/settings.module').then(m => m.SettingsPageModule) },
      { path: 'prodevice/editlayouter/:deviceType', loadChildren: () => import('./pages/editlayouter/editlayouter.module').then(m => m.EditlayouterPageModule) },
      { path: 'prodevice/editlayouter/ieconfig/:deviceType', loadChildren: () => import('./pages/editlayouter/ieconfig/ieconfig.module').then(m => m.IeconfigPageModule) },
      { path: 'prodevice/editinfo/:deviceType', loadChildren: () => import('./pages/editinfo/editinfo.module').then(m => m.EditinfoPageModule) },
      { path: 'prodevice/public/:deviceType', loadChildren: () => import('./pages/publicprodevice/publicprodevice.module').then(m => m.PublicprodevicePageModule) },
      { path: 'tool/espTouch', loadChildren: () => import('../adddevice/esptouch/esptouch.module').then(m => m.EsptouchPageModule) },
      { path: 'tool/apConfig', loadChildren: () => import('../adddevice/apconfig/apconfig.module').then(m => m.ApconfigPageModule) },
      { path: 'tool/qrScanner', loadChildren: () => import('../adddevice/qrscanner/qrscanner.module').then(m => m.QrscannerPageModule) },
      { path: 'tool/bleConfig', loadChildren: () => import('../adddevice/bleconfig/bleconfig.module').then(m => m.BleconfigModule) }
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
