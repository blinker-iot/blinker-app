import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { OwnAirdetectorSettingsPage } from './own-airdetector-settings';
import { PipesModule } from '../../../../pipes/pipes.module';
@NgModule({
  declarations: [
    OwnAirdetectorSettingsPage,
  ],
  imports: [
    IonicPageModule.forChild(OwnAirdetectorSettingsPage),
    PipesModule
  ],
})
export class OwnAirdetectorSettingsPageModule {}
