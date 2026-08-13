import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular';

import { widgetButtonListComponent } from './widget-buttonlist';
import { WidgetsModule } from '../widgets/widgets.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    WidgetsModule
  ],
  declarations: [widgetButtonListComponent],
  exports: [widgetButtonListComponent]
})
export class widgetButtonListModule { }
