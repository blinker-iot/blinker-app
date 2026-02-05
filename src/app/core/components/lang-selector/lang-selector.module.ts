import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LangSelectorComponent } from './lang-selector.component';

@NgModule({
  imports: [
    CommonModule,
    LangSelectorComponent
  ],
  exports: [LangSelectorComponent]
})
export class LangSelectorModule { }
