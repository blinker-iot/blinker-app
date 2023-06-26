import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BActcmdListComponent } from './b-actcmd-list.component';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../../pipes/pipes.module';
import { widgetButtonListModule } from 'src/app/device/layouter2/widget-buttonlist/widget-buttonlist.module';

@NgModule({
  declarations: [
    BActcmdListComponent
  ],
  imports: [
    IonicModule, 
    CommonModule,
    PipesModule,
    widgetButtonListModule
  ],
  exports: [
    BActcmdListComponent
  ]
})
export class BActcmdListModule { }
