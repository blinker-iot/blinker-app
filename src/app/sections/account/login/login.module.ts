import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { LoginPage } from './login';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
import { FirstModalModule } from '../first-modal/first-modal.module';
import { LangSelectorModule } from 'src/app/core/components/lang-selector/lang-selector.module';

const routes: Routes = [
  {
    path: '',
    component: LoginPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild(),
    LangSelectorModule,
    FirstModalModule
  ],
  declarations: [LoginPage]
})
export class LoginPageModule {}
