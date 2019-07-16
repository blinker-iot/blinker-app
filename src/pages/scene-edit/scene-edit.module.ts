import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { SceneEditPage } from './scene-edit';
import { ComponentsModule } from '../../components/components.module';

@NgModule({
  declarations: [
    SceneEditPage,
  ],
  imports: [
    IonicPageModule.forChild(SceneEditPage),
    ComponentsModule
  ],
})
export class SceneEditPageModule {}
