import { NgModule } from '@angular/core';
import { CommonModule } from "@angular/common";
import { MinuteToTimePipe } from './minute-to-time';
import { ObjToStrPipe } from './obj-to-str';
import { OwnplugAct2strPipe } from './ownplug-act2str';
import { MsToDatePipe } from './ms-to-date';
import { HtmlPipe } from './html.pipe';
import { WrapPipe } from './wrap.pipe';

@NgModule({
    declarations: [
        MinuteToTimePipe,
        ObjToStrPipe,
        OwnplugAct2strPipe,
        MsToDatePipe,
        HtmlPipe,
        WrapPipe
    ],
    imports: [CommonModule],
    exports: [
        MinuteToTimePipe,
        ObjToStrPipe,
        OwnplugAct2strPipe,
        MsToDatePipe,
        HtmlPipe,
        WrapPipe
    ]
})
export class PipesModule { }
