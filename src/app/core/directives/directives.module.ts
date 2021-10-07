import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatuabrOverlayPaddingDirective } from './overlay-padding.directive';



@NgModule({
  declarations: [StatuabrOverlayPaddingDirective],
  imports: [
    CommonModule
  ],
  exports: [
    StatuabrOverlayPaddingDirective
  ]
})
export class DirectivesModule { }
