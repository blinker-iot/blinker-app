import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { RoomEditPage } from './room-edit';

const routes: Routes = [
  { path: '', component: RoomEditPage }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [RoomEditPage]
})
export class RoomEditPageModule { }
