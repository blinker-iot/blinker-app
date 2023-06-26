import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BSliderComponent } from './b-slider/b-slider.component';



@NgModule({
  declarations: [BSliderComponent],
  imports: [
    CommonModule
  ],
  exports:[
    BSliderComponent
  ]
})
export class ComponentsModule { }
