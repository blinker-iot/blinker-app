import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { RoomEditPage } from './room-edit';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  { path: '', component: RoomEditPage }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [RoomEditPage]
})
export class RoomEditPageModule { }
