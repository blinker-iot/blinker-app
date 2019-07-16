import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { SceneEditAddactPage } from './scene-edit-addact';
import { ComponentsModule } from '../../components/components.module';


@NgModule({
  declarations: [
    SceneEditAddactPage,
  ],
  imports: [
    IonicPageModule.forChild(SceneEditAddactPage),
    ComponentsModule
  ],
})
export class SceneEditAddactPageModule { }
