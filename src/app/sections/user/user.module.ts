import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { UserPage } from './user.page';

const routes: Routes = [
  {
    path: 'user',
    children: [
      { path: '', component: UserPage },
      { path: 'avatar', loadChildren: './user-avatar/user-avatar.module#UserAvatarPageModule' }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [UserPage]
})
export class BlinkerUserModule { }
