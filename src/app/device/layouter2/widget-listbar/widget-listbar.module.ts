import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { WidgetListbarComponent } from './widget-listbar.component';
import { TranslatePipe } from '@ngx-translate/core';


@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    TranslatePipe,
    WidgetListbarComponent
  ],
  exports: [
    WidgetListbarComponent
  ]
})
export class WidgetListbarModule { }
