import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { Layouter2 } from './layouter2';
import { GridsterModule } from 'angular-gridster2';
import { WidgetsModule } from './widgets/widgets.module';
import { WidgetListbarModule } from './widget-listbar/widget-listbar.module';
import { Layouter2GuidePageModule } from './guide/layouter2-guide.module';
import { BackgroundComponent } from './background/background.component';
import { WidgetEditor } from './widget-editor/widget-editor';
import { FormsModule } from '@angular/forms';
import { IconListPageModule } from 'src/app/core/pages/icon-list/icon-list.module';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    DirectivesModule,
    FormsModule,
    ComponentsModule,
    GridsterModule,
    WidgetsModule,
    WidgetListbarModule,
    Layouter2GuidePageModule,
    IconListPageModule
    // RouterModule.forChild(routes),
  ],
  declarations: [
    Layouter2,
    BackgroundComponent,
    WidgetEditor
  ],
  exports: [
    Layouter2
  ]
})

export class Layouter2Module { }
