import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { Layouter2GuidePage } from './layouter2-guide';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule
  ],
  declarations: [Layouter2GuidePage],
  exports: [Layouter2GuidePage]
})
export class Layouter2GuidePageModule { }

