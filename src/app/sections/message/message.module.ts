import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { MessagePage } from './message.page';
import { MessContentComponent } from './mess-content/mess-content.component';
import { MessItemComponent } from './mess-item/mess-item.component';

const routes: Routes = [
  {
    path: 'message',
    component: MessagePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [MessagePage,MessItemComponent,MessContentComponent]
})
export class BlinkerMessageModule { }
