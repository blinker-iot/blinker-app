import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { WidgetListbarComponent } from './widget-listbar.component';


@NgModule({
  declarations: [
    WidgetListbarComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
  ],
  exports: [
    WidgetListbarComponent
  ]
})
export class WidgetListbarModule { }
