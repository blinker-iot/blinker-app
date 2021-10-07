import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { UserPage } from './user.page';
import { AvatarPickerModule } from 'src/app/core/pages/avatar/avatar-picker.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  {
    path: 'user',
    children: [
      { path: '', component: UserPage }
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AvatarPickerModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [UserPage]
})
export class BlinkerUserModule { }
