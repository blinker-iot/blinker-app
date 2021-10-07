import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { SceneManager } from './scene-manager/scene-manager';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { SceneEditor } from './scene-editor/scene-edit';
import { BActcmdListModule } from 'src/app/core/components/b-actcmd-list/b-actcmd-list.module';
import { SceneEditorAddact } from './components/scene-editor-addact/scene-edit-addact';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  {
    path: 'scene-manager',
    children: [
      { path: '', component: SceneManager },
      { path: ':scene', component: SceneEditor },
      { path: ':scene/addact', component: SceneEditorAddact }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    BActcmdListModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [
    SceneManager,
    SceneEditor,
    SceneEditorAddact
  ]
})
export class BlinkerSceneManagerModule { }
