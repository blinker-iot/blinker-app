import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { SceneEditAddactPage } from './scene-edit-addact';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { widgetButtonListModule } from 'src/app/core/device/layouter2/widget-buttonlist/widget-buttonlist.module';

const routes: Routes = [
  {
    path: '',
    component: SceneEditAddactPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    widgetButtonListModule,
    RouterModule.forChild(routes)
  ],
  declarations: [SceneEditAddactPage]
})
export class SceneEditAddactPageModule { }
