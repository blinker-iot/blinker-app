import { NgModule } from '@angular/core';
import { LayoutDisplayPipe } from './layout-display/layout-display';
import { CommonModule } from "@angular/common";
import { Devicename2macPipe } from './devicename2mac/devicename2mac';
import { MinuteToTimePipe } from './minute-to-time/minute-to-time';
import { ObjToStrPipe } from './obj-to-str/obj-to-str';
import { OwnplugAct2strPipe } from './ownplug-act2str/ownplug-act2str';

@NgModule({
    declarations: [
        LayoutDisplayPipe,
        Devicename2macPipe,
    MinuteToTimePipe,
    ObjToStrPipe,
    OwnplugAct2strPipe,
    ],
    imports: [CommonModule],
    exports: [
        LayoutDisplayPipe,
        Devicename2macPipe,
    MinuteToTimePipe,
    ObjToStrPipe,
    OwnplugAct2strPipe
    ]
})
export class PipesModule { }
