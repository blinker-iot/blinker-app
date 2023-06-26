import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SliderComponent } from './slider/slider.component';
import { ValueComponent } from './value/value.component';
import { ButtonComponent } from './button/button.component';
import { TextComponent } from './text/text.component';
import { ComponentsModule } from '../components/components.module';



@NgModule({
  declarations: [
    SliderComponent,
    ButtonComponent,
    ValueComponent,
    TextComponent
  ],
  imports: [
    CommonModule,
    ComponentsModule
  ],
  exports: [
    SliderComponent,
    ButtonComponent,
    ValueComponent,
    TextComponent
  ]
})
export class WidgetsModule { }
