import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { UserDevicesPage } from './user-devices';
import { PipesModule } from '../../pipes/pipes.module';

@NgModule({
  declarations: [
    UserDevicesPage,
  ],
  imports: [
    IonicPageModule.forChild(UserDevicesPage),
    PipesModule
  ],
})
export class UserDevicesPageModule {}
