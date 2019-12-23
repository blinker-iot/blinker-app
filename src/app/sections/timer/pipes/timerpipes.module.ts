import { NgModule } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Act2TextPipe } from './act2text';

@NgModule({
    declarations: [
        Act2TextPipe
    ],
    imports: [CommonModule],
    exports: [
        Act2TextPipe
    ]
})
export class TimerPipesModule { }
