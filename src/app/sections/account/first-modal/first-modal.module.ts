import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FirstModalComponent } from './first-modal.component';



@NgModule({
  declarations: [FirstModalComponent],
  imports: [
    CommonModule
  ],
  exports: [FirstModalComponent]
})
export class FirstModalModule { }
