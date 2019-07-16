import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { UserDevtoolPage } from './user-devtool';

@NgModule({
  declarations: [
    UserDevtoolPage,
  ],
  imports: [
    IonicPageModule.forChild(UserDevtoolPage),
  ],
})
export class UserDevtoolPageModule {}
