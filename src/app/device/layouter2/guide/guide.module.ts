import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Layouter2GuidePage } from './guide';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { EsptouchComponent } from './esptouch/esptouch.component';
import { ExamplesComponent } from './examples/examples.component';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';
import { NewuiModule } from '../newui/newui.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    NewuiModule,
    TranslateModule.forChild(),
    RouterModule
  ],
  declarations: [
    Layouter2GuidePage,
    EsptouchComponent,
    ExamplesComponent
  ],
  exports: [Layouter2GuidePage]
})
export class Layouter2GuideModule { }

