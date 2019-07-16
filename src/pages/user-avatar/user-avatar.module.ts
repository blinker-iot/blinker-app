import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { UserAvatarPage } from './user-avatar';

@NgModule({
  declarations: [
    UserAvatarPage,
  ],
  imports: [
    IonicPageModule.forChild(UserAvatarPage),
  ],
})
export class UserAvatarPageModule {}
