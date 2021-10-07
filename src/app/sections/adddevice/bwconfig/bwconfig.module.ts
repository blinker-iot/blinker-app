import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { BwconfigPage } from './bwconfig';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { ConfigStateComponent } from './config-state/config-state.component';

const routes: Routes = [
  {
    path: '',
    component: BwconfigPage
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
  declarations: [BwconfigPage,ConfigStateComponent]
})
export class BwconfigPageModule { }
