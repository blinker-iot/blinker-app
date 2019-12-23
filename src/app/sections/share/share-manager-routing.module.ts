import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ShareService } from './share.service';

const routes: Routes = [
    {
        path: 'share-manager',
        children: [
            { path: '', loadChildren: './share-manager/share-manager.module#ShareManagerPageModule' },
            { path: ':id', loadChildren: './share-edit/share-edit.module#ShareEditPageModule' }
        ]
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(routes)
    ],
    exports: [
        RouterModule
    ],
    providers: [
        ShareService
    ]
})
export class BlinkerShareManagerModule { }