import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: 'scene-manager',
        children: [
            { path: '', loadChildren: './scene-manager/scene-manager.module#SceneManagerPageModule' },
            { path: ':scene', loadChildren: './scene-edit/scene-edit.module#SceneEditPageModule' },
        ]
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(routes)
    ],
    exports: [
        RouterModule
    ]
})
export class BlinkerSceneManagerModule { }