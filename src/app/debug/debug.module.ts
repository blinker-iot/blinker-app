import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DebugComponent } from './debug.component';
import { PipesModule } from '../core/pipes/pipes.module';

@NgModule({
  imports: [
    PipesModule,
    CommonModule,
    FormsModule,
    DebugComponent
  ],
  exports: [
    DebugComponent
  ]
})
export class DebugModule { }
