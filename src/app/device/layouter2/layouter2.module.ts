import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Layouter2Component } from './layouter2';
import { GridsterModule } from 'angular-gridster2';
import { WidgetsModule } from './widgets/widgets.module';
import { WidgetListbarModule } from './widget-listbar/widget-listbar.module';
import { FormsModule } from '@angular/forms';
import { IconListPageModule } from 'src/app/core/pages/icon-list/icon-list.module';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { WidgetToolbarComponent } from './widget-toolbar/widget-toolbar.component';
import { Layouter2Service } from './layouter2.service';
import { WidgetEditorModule } from './widget-editor2/widget-editor.module';
import { TranslateModule } from '@ngx-translate/core';

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
    IconListPageModule,
    WidgetToolbarComponent,
    WidgetEditorModule,
    TranslateModule.forChild()
  ],
  declarations: [
    Layouter2Component
  ],
  exports: [
    Layouter2Component
  ],
  providers: [
    Layouter2Service
  ]
})

export class Layouter2Module { }
