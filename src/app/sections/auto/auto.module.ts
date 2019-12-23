import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AutoPage } from './auto.page';
import { AutoEditComponent } from './auto-edit/auto-edit.component';

const routes: Routes = [
  {
    path: 'auto-manager',
    component: AutoPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [AutoPage,AutoEditComponent]
})
export class BlinkerAutoModule {}
