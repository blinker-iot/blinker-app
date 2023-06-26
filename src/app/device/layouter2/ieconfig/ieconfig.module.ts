import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IeconfigComponent } from './ieconfig.component'
import { DirectivesModule } from 'src/app/core/directives/directives.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule
  ],
  declarations: [IeconfigComponent],
  exports: [
    IeconfigComponent
  ]
})
export class IeconfigModule { }
