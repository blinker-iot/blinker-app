import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { ViewHomePage } from './view-home.page';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DeviceblockZone } from './components/deviceblock-zone/deviceblock-zone';
import { BlinkerSpeechModule } from 'src/app/sections/speech/speech.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
import { RoomListComponent } from './components/room-list/room-list';
import { DeviceblockListComponent } from './components/deviceblock-list/deviceblock-list';
import { Deviceblock } from './components/deviceblock/deviceblock';

const routes: Routes = [
  {
    path: '',
    component: ViewHomePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ComponentsModule,
    BlinkerSpeechModule,
    RouterModule.forChild(routes),
    DirectivesModule,
    TranslateModule.forChild()
  ],
  declarations: [
    ViewHomePage,
    RoomListComponent,
    DeviceblockZone,
    DeviceblockListComponent,
    Deviceblock
  ],
  exports: [ViewHomePage]
})
export class ViewHomePageModule { }
