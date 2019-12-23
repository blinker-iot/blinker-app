import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IeconfigComponent } from './ieconfig.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
  ],
  declarations: [IeconfigComponent],
  exports: [
    IeconfigComponent
  ]
})
export class IeconfigModule { }
