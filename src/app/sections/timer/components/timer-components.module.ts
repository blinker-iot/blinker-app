import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular';

import { CountdownComponent } from './countdown/countdown';
import { LoopComponent } from './loop/loop';
import { TimingComponent } from './timing/timing';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { widgetButtonListModule } from 'src/app/core/device/layouter2/widget-buttonlist/widget-buttonlist.module';
import { Routes, RouterModule } from '@angular/router';
import { CmdlistComponent } from './cmdlist/cmdlist.component';
import { TimingEditPage } from './timing/timing-edit/timing-edit';
import { TimerPipesModule } from '../pipes/timerpipes.module';

const routes: Routes = [
  { path: 'timing/:id', component: TimingComponent },
  { path: 'countdown/:id', component: CountdownComponent },
  { path: 'loop/:id', component: LoopComponent },
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    PipesModule,
    TimerPipesModule,
    ComponentsModule,
    widgetButtonListModule,
    RouterModule.forChild(routes)
  ],
  declarations: [
    CountdownComponent,
    LoopComponent,
    TimingComponent,
    CmdlistComponent,
    TimingEditPage,
  ],
  exports: [
    CountdownComponent,
    LoopComponent,
    TimingComponent,
    // CmdlistComponent,
    // TimingEditPageModule,
  ],
  entryComponents: [
    TimingEditPage
  ]
})
export class TimerComponentsModule { }
