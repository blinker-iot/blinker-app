import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { Layouter2 } from './layouter2';
import { Gridster, GridsterItem } from 'angular-gridster2';
import { WidgetsModule } from './widgets/widgets.module';
import { WidgetListbarModule } from './widget-listbar/widget-listbar.module';
import { Layouter2GuidePageModule } from './guide/layouter2-guide.module';
import { WidgetEditor } from './widget-editor/widget-editor';
import { FormsModule } from '@angular/forms';
import { ComponentsModule } from 'src/app/core/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ComponentsModule,
    Gridster,
    GridsterItem,
    WidgetsModule,
    WidgetListbarModule,
    Layouter2GuidePageModule
    // RouterModule.forChild(routes),
  ],
  declarations: [
    Layouter2,
    WidgetEditor
  ],
  exports: [
    Layouter2
  ]
})

export class Layouter2Module { }
