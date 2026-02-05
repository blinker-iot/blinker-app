import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { WidgetListbarComponent } from './widget-listbar.component';
import { TranslateModule } from '@ngx-translate/core';


@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    TranslateModule.forChild(),
    WidgetListbarComponent
  ],
  exports: [
    WidgetListbarComponent
  ]
})
export class WidgetListbarModule { }
