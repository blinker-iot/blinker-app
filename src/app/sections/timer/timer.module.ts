import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TimerPage } from './timer';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { TimerService } from './timer.service';
import { TimingComponent } from './components/timing/timing';
import { CountdownComponent } from './components/countdown/countdown';
import { LoopComponent } from './components/loop/loop';
import { TimingEditPage } from './components/timing-edit/timing-edit';
import { BActcmdListModule } from 'src/app/core/components/b-actcmd-list/b-actcmd-list.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { NgZorroAntdMobileModule } from 'ng-zorro-antd-mobile';
import { ModalsModule } from 'src/app/core/modals/modals.module';

const routes: Routes = [
  {
    path: 'timer/:deviceId',
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
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ComponentsModule,
    BActcmdListModule,
    DirectivesModule,
    PipesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild(),
    NgZorroAntdMobileModule,
    ModalsModule
  ],
  providers: [
    TimerService
  ],
  declarations: [
    TimerPage,
    TimingComponent,
    CountdownComponent,
    LoopComponent,
    TimingEditPage
  ]
})
export class BlinkerTimerModule { }
