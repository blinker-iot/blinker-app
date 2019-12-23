import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { TimerPage } from './timer';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { TimerComponentsModule } from './components/timer-components.module';
import { TimerService } from './timer.service';
import { TimingComponent } from './components/timing/timing';
import { CountdownComponent } from './components/countdown/countdown';
import { LoopComponent } from './components/loop/loop';

const routes: Routes = [
  {
    path: 'timer/:id',
    component: TimerPage,
    children: [
      {
        path: '',
        redirectTo: 'timing',
        pathMatch: 'full',
      },
      { path: 'timing', component: TimingComponent },
      { path: 'countdown', component: CountdownComponent },
      { path: 'loop', component: LoopComponent },
    ]

  },
  // { path: 'timing/:id', component: TimingComponent },
  // { path: 'countdown/:id', component: CountdownComponent },
  // { path: 'loop/:id', component: LoopComponent },
  // { path: ':id/timing-edit', loadChildren:'./timing-edit/timing-edit.module#TimingEditPageModule' }
  // ]
  // }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    TimerComponentsModule,
    RouterModule.forChild(routes)
  ],
  providers: [
    TimerService
  ],
  declarations: [
    TimerPage
  ]
})
export class BlinkerTimerModule { }
