import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DeviceTriggerComponent } from './device-trigger.component';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { FormsModule } from '@angular/forms';

const routes: Routes = [
  { path: "", component: DeviceTriggerComponent }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [
    DeviceTriggerComponent,
  ]
})
export class DeviceTriggerConfigPageModule { }

