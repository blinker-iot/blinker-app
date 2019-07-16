import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { UserTelPage } from './user-tel';

@NgModule({
  declarations: [
    UserTelPage,
  ],
  imports: [
    IonicPageModule.forChild(UserTelPage),
  ],
})
export class UserTelPageModule {}
