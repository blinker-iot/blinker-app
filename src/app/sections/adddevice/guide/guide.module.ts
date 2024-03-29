import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { GuidePage } from './guide';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { MarkdownModule } from 'ngx-markdown';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  {
    path: '',
    component: GuidePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    ComponentsModule,
    DirectivesModule,
    MarkdownModule.forChild(),
    RouterModule.forChild(routes)
  ],
  declarations: [GuidePage]
})
export class GuidePageModule {}
