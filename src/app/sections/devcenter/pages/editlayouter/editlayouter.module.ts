import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { EditlayouterPage } from './editlayouter.page';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { Layouter2Module } from 'src/app/device/layouter2/layouter2.module';

const routes: Routes = [
  {
    path: '',
    component: EditlayouterPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    Layouter2Module,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [EditlayouterPage]
})
export class EditlayouterPageModule {}
