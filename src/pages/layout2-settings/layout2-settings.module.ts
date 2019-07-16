import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { Layout2SettingsPage } from './layout2-settings';
import { PipesModule } from '../../pipes/pipes.module';

@NgModule({
  declarations: [
    Layout2SettingsPage,
  ],
  imports: [
    IonicPageModule.forChild(Layout2SettingsPage),
    PipesModule
  ],
})
export class Layout2SettingsPageModule {}
