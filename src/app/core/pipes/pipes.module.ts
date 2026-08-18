import { NgModule } from '@angular/core';
import { CommonModule } from "@angular/common";
import { MinuteToTimePipe } from './minute-to-time';
import { ObjToStrPipe } from './obj-to-str';
import { OwnplugAct2strPipe } from './ownplug-act2str';
import { MsToDatePipe } from './ms-to-date';
import { HtmlPipe } from './html.pipe';
import { WrapPipe } from './wrap.pipe';
import { Act2TextPipe } from './actcmd2text';
import { Days2TextPipe } from './days2text';

@NgModule({
    imports: [
        CommonModule,
        MinuteToTimePipe,
        ObjToStrPipe,
        OwnplugAct2strPipe,
        MsToDatePipe,
        HtmlPipe,
        WrapPipe,
        Act2TextPipe,
        Days2TextPipe
    ],
    exports: [
        MinuteToTimePipe,
        ObjToStrPipe,
        OwnplugAct2strPipe,
        MsToDatePipe,
        HtmlPipe,
        WrapPipe,
        Act2TextPipe,
        Days2TextPipe
    ]
})
export class PipesModule { }
