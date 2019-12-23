import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: 'room-manager',
        children: [
            { path: '', loadChildren: './room-manager/room-manager.module#RoomManagerPageModule' },
            { path: ':room', loadChildren: './room-edit/room-edit.module#RoomEditPageModule' },
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