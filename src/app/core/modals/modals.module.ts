import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RepeatSelectorModalComponent } from './repeat-selector-modal/repeat-selector-modal.component';
import { TimeSelectorModalComponent } from './time-selector-modal/time-selector-modal.component';
import { ActionSelectorModalComponent } from './action-selector-modal/action-selector-modal.component';
import { DeviceSelectorModalComponent } from './device-selector-modal/device-selector-modal.component';
import { PipesModule } from '../pipes/pipes.module';
import { TranslateModule } from '@ngx-translate/core';
import { ComponentsModule } from '../components/components.module';
import { SelectorModalComponent } from './selector-modal/selector-modal.component';



@NgModule({
  declarations: [
    RepeatSelectorModalComponent,
    ActionSelectorModalComponent,
    TimeSelectorModalComponent,
    DeviceSelectorModalComponent,
    SelectorModalComponent
  ],
  imports: [
    CommonModule,
    PipesModule,
    ComponentsModule,
    TranslateModule.forChild()
  ],
  exports: [
    RepeatSelectorModalComponent,
    ActionSelectorModalComponent,
    TimeSelectorModalComponent,
    DeviceSelectorModalComponent,
    SelectorModalComponent
  ]
})
export class ModalsModule { }
