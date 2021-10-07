import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { IconListPage } from './icon-list';
import { DirectivesModule } from '../../directives/directives.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    DirectivesModule
  ],
  declarations: [IconListPage],
  exports: [IconListPage]
})
export class IconListPageModule { }
