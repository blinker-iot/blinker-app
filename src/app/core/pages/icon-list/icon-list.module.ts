import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { IconListPage } from './icon-list';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
  ],
  declarations: [IconListPage],
  entryComponents: [IconListPage],
  exports: [IconListPage]
})
export class IconListPageModule { }
