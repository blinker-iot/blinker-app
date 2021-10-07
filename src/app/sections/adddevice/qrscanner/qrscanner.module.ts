import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { QrscannerPage } from './qrscanner.page';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  {
    path: '',
    component: QrscannerPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [QrscannerPage]
})
export class QrscannerPageModule {}
