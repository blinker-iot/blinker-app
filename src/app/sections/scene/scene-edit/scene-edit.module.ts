import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';
import { SceneEditPage } from './scene-edit';
import { ComponentsModule } from 'src/app/core/components/components.module';

const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', component: SceneEditPage },
      { path: 'addact', loadChildren: './scene-edit-addact/scene-edit-addact.module#SceneEditAddactPageModule' }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    RouterModule.forChild(routes)
  ],
  declarations: [SceneEditPage]
})
export class SceneEditPageModule { }
