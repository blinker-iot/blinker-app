import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { Layouter2GuidePage } from './layouter2-guide';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
  ],
  declarations: [Layouter2GuidePage],
  exports: [Layouter2GuidePage],
  entryComponents:[Layouter2GuidePage]
})
export class Layouter2GuidePageModule { }

