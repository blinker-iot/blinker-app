import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { FormsModule } from '@angular/forms';
import { NgxColorsModule } from 'ngx-colors';
import { CheckListComponent } from './check-list/check-list.component';
import { NumberInputComponent } from './number-input/number-input.component';
import { IconPickerComponent } from './icon-picker/icon-picker.component';
import { DoubleNumberInputComponent } from './double-number-input/double-number-input.component';
import { AlignSelectorComponent } from './align-selector/align-selector.component';

@NgModule({
  declarations: [
    ColorPickerComponent,
    CheckListComponent,
    NumberInputComponent,
    IconPickerComponent,
    DoubleNumberInputComponent,
    AlignSelectorComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    NgxColorsModule
  ],
  exports: [
    ColorPickerComponent,
    CheckListComponent,
    NumberInputComponent,
    IconPickerComponent,
    DoubleNumberInputComponent,
    AlignSelectorComponent
  ]
})
export class EditComponentsModule { }
