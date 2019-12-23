import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { RoomManagerPage } from './room-manager';

const routes: Routes = [
  {
    path: '',
    component: RoomManagerPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [RoomManagerPage]
})
export class RoomManagerPageModule { }
