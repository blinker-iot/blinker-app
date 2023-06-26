import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LangSelectorComponent } from './lang-selector.component';

@NgModule({
  declarations: [LangSelectorComponent],
  imports: [
    CommonModule
  ],
  exports: [LangSelectorComponent]
})
export class LangSelectorModule { }
