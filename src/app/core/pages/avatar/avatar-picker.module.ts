import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarPickerComponent } from './avatar-picker.component';
import { IonicModule } from '@ionic/angular';
import { DirectivesModule } from '../../directives/directives.module';

@NgModule({
  declarations: [AvatarPickerComponent],
  imports: [
    CommonModule,
    IonicModule,
    DirectivesModule
  ],
  exports: [
    AvatarPickerComponent
  ]
})
export class AvatarPickerModule { }
