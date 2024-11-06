import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DevicePage } from './device.page';
import { Layouter2Module } from './layouter2/layouter2.module';
// import { Customizer } from './customizer/customizer.component';
import { TranslateModule } from '@ngx-translate/core';
import { LayouterGuard } from './layouter2/layouter.guard';
import { DirectivesModule } from '../core/directives/directives.module';
// import { DeviceTemplateModule } from './template/template.module';
import { Layouter2GuideModule } from './layouter2/guide/guide.module';

const routes: Routes = [
  { path: 'device/:id', component: DevicePage, canDeactivate: [LayouterGuard] }
];

@NgModule({
  declarations: [DevicePage],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    Layouter2Module,
    Layouter2GuideModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
})
export class BlinkerDeviceModule { }
