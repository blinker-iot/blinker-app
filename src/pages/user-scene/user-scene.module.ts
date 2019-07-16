import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { UserScenePage } from './user-scene';
import { ComponentsModule } from '../../components/components.module';

@NgModule({
  declarations: [
    UserScenePage,
  ],
  imports: [
    IonicPageModule.forChild(UserScenePage),
    ComponentsModule
  ],
})
export class UserScenePageModule {}
