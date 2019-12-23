import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DocPage } from './doc.page';
import { PipesModule } from '../../pipes/pipes.module';
import { MarkdownModule } from 'ngx-markdown';

// const routes: Routes = [
//   {
//     path: 'doc/:docName',
//     component: DocPage
//   }
// ];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    MarkdownModule.forChild(),
  ],
  declarations: [DocPage],
  entryComponents: [DocPage]
})
export class DocModule { }
