import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { RoomManagerPage } from './room-manager';

@NgModule({
  declarations: [
    RoomManagerPage,
  ],
  imports: [
    IonicPageModule.forChild(RoomManagerPage),
  ],
})
export class RoomManagerPageModule {}
