import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnPlugSettingsPage } from './own-plug-settings';

@NgModule({
  declarations: [
    OwnPlugSettingsPage,
  ],
  imports: [
    IonicPageModule.forChild(OwnPlugSettingsPage),
  ],
})
export class OwnPlugSettingsPageModule {}
