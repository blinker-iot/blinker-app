import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: 'room-manager',
        children: [
            { path: '', loadChildren: () => import('./room-manager/room-manager.module').then(m => m.RoomManagerPageModule) },
            { path: ':room', loadChildren: () => import('./room-edit/room-edit.module').then(m => m.RoomEditPageModule) },
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
export class BlinkerRoomManagerModule { }