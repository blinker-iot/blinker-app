import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { DeviceSettingsPage } from './device-settings';
import { PipesModule } from '../../pipes/pipes.module';

@NgModule({
  declarations: [
    DeviceSettingsPage,
  ],
  imports: [
    IonicPageModule.forChild(DeviceSettingsPage),
    PipesModule
  ],
})
export class DeviceSettingsPageModule {}
