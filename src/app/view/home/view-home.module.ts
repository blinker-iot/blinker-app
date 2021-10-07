import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { ViewHomePage } from './view-home.page';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { RoomListComponent } from './room-list/room-list';
import { DeviceblockHomelistComponent } from './deviceblock-homelist/deviceblock-homelist';
import { BlinkerSpeechModule } from 'src/app/sections/speech/speech.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
// import { SpeechPageModule } from 'src/app/sections/speech/speech.module';
// import { SortablejsModule } from 'angular-sortablejs';
// import { AuthGuard } from 'src/app/core/guard/auth.guard';

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
    DeviceblockHomelistComponent
  ],
  exports: [ViewHomePage]
})
export class ViewHomePageModule { }
