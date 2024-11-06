import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { WidgetListbarComponent } from './widget-listbar.component';
import { TranslateModule } from '@ngx-translate/core';


@NgModule({
  declarations: [
    WidgetListbarComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    TranslateModule.forChild()
  ],
  exports: [
    WidgetListbarComponent
  ]
})
export class WidgetListbarModule { }
