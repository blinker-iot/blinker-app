import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DeviceActionComponent } from './device-action';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { FormsModule } from '@angular/forms';

const routes: Routes = [
  { path: "", component: DeviceActionComponent }
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
    DeviceActionComponent,
  ]
})
export class DeviceActionConfigPageModule { }

