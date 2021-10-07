import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DebugComponent } from './debug.component';
import { PipesModule } from '../core/pipes/pipes.module';

@NgModule({
  declarations: [
    DebugComponent
  ],
  imports: [
    PipesModule,
    CommonModule,
    FormsModule,
  ],
  exports: [
    DebugComponent
  ]
})
export class DebugModule { }
