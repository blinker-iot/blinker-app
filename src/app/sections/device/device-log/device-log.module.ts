import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { DeviceLogComponent } from './device-log.component';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

const routes: Routes = [
  { path: "", component: DeviceLogComponent }
];


@NgModule({
  declarations: [DeviceLogComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
    RouterModule.forChild(routes)
  ]
})
export class DeviceLogModule { }
