import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { PublicprodevicePage } from './publicprodevice.page';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { devCenterComponentsModule } from '../../components/components.module';
import { MarkdownModule } from 'ngx-markdown';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  {
    path: '',
    component: PublicprodevicePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    MarkdownModule.forChild(),
    devCenterComponentsModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [PublicprodevicePage]
})
export class PublicprodevicePageModule {}
