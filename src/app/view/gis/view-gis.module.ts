import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { ViewGisPage } from './view-gis.page';
import { InfoBarComponent } from './info-bar/info-bar.component';

const routes: Routes = [
  {
    path: '',
    component: ViewGisPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [ViewGisPage, InfoBarComponent]
})
export class ViewGisPageModule {}
