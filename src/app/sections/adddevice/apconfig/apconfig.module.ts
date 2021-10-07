import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ApconfigPage } from './apconfig';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
import { ConfigStatePage } from './config-state/config-state';
import { IosGuideComponent } from './components/ios-guide/ios-guide.component';

const routes: Routes = [
  {
    path: '',
    component: ApconfigPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [ApconfigPage, ConfigStatePage, IosGuideComponent]
})
export class ApconfigPageModule { }
