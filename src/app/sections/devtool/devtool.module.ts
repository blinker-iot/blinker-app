import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DevtoolPage } from './devtool';

const routes: Routes = [
  {
    path: 'devtool',
    children: [
      { path: '', component: DevtoolPage },
      { path: 'esptouch', loadChildren: '../adddevice/esptouch/esptouch.module#EsptouchPageModule' },
      { path: 'qrscanner', loadChildren: '../adddevice/qrscanner/qrscanner.module#QrscannerPageModule' }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [DevtoolPage]
})
export class BlinkerDevtoolModule { }
