import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DeviceUpdatePage } from './device-update';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  { path: "", component: DeviceUpdatePage }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ],
  declarations: [
    DeviceUpdatePage,
  ]
})
export class DeviceUpdatePageModule { }

