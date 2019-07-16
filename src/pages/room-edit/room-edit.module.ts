import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { RoomEditPage } from './room-edit';

@NgModule({
  declarations: [
    RoomEditPage,
  ],
  imports: [
    IonicPageModule.forChild(RoomEditPage),
  ],
})
export class RoomEditPageModule {}
