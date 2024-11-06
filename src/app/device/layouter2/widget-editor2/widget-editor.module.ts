import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { IconListPageModule } from 'src/app/core/pages/icon-list/icon-list.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { WidgetEditor } from './widget-editor';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { FormsModule } from '@angular/forms';
import { WidgetButtonEditComponent } from './widget-button-edit/widget-button-edit.component';
import { BackgroundEditComponent } from './background-edit/background-edit.component';
import { WidgetImageEditComponent } from './widget-image-edit/widget-image-edit.component';
import { WidgetTextEditComponent } from './widget-text-edit/widget-text-edit.component';
import { WidgetIconEditComponent } from './widget-icon-edit/widget-icon-edit.component';
import { WidgetSliderEditComponent } from './widget-slider-edit/widget-slider-edit.component';
import { WidgetDebugEditComponent } from './widget-debug-edit/widget-debug-edit.component';
import { WidgetChartEditComponent } from './widget-chart-edit/widget-chart-edit.component';
import { WidgetNumberEditComponent } from './widget-number-edit/widget-number-edit.component';
import { WidgetVideoEditComponent } from './widget-video-edit/widget-video-edit.component';
import { EditComponentsModule } from './edit-components/edit-components.module';
import { WidgetBaseEditComponent } from './base-edit/base-edit.component';
import { NewuiModule } from '../newui/newui.module';
import { WidgetCustomEditComponent } from './widget-custom-edit/widget-custom-edit.component';
import { WidgetSelectEditComponent } from './widget-select-edit/widget-select-edit.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    IconListPageModule,
    ComponentsModule,
    NewuiModule,
    EditComponentsModule
  ],
  declarations: [
    WidgetEditor,
    BackgroundEditComponent,
    WidgetBaseEditComponent,
    WidgetButtonEditComponent,
    WidgetImageEditComponent,
    WidgetTextEditComponent,
    WidgetIconEditComponent,
    WidgetSliderEditComponent,
    WidgetDebugEditComponent,
    WidgetChartEditComponent,
    WidgetNumberEditComponent,
    WidgetVideoEditComponent,
    WidgetCustomEditComponent,
    WidgetSelectEditComponent
  ],
  exports: [
    WidgetEditor,
  ]
})

export class WidgetEditorModule { }
