import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { widgetButtonListModule } from '../../device/layouter2/widget-buttonlist/widget-buttonlist.module';
import { BActcmdListComponent } from './b-actcmd-list.component';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../../pipes/pipes.module';

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
