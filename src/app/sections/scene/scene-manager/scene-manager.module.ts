import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { SceneManagerPage } from './scene-manager';
import { ComponentsModule } from 'src/app/core/components/components.module';

const routes: Routes = [
  {
    path: '',
    component: SceneManagerPage,
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    RouterModule.forChild(routes)
  ],
  declarations: [SceneManagerPage]
})
export class SceneManagerPageModule { }
