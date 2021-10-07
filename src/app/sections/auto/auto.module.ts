import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AutoManagerPage } from './auto-manager/auto-manager';
import { AutoEditComponent } from './auto-edit/auto-edit.component';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { TimeModalComponent } from './time-modal/time-modal.component';
import { Trigger2textPipe } from './trigger2text.pipe';
import { AutoEditTriggerComponent } from './auto-edit-trigger/auto-edit-trigger.component';
import { AutoEditActionComponent } from './auto-edit-action/auto-edit-action.component';
import { BActcmdListModule } from 'src/app/core/components/b-actcmd-list/b-actcmd-list.module';
import { SourceListComponent } from './source-list/source-list.component';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  {
    path: 'auto-manager',
    children: [
      { path: '', component: AutoManagerPage },
      { path: 'edit/:id', component: AutoEditComponent }
    ]

  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ComponentsModule,
    BActcmdListModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [
    AutoManagerPage,
    AutoEditComponent,
    TimeModalComponent,
    AutoEditTriggerComponent,
    AutoEditActionComponent,
    Trigger2textPipe,
    SourceListComponent

  ]
})
export class BlinkerAutoModule { }
