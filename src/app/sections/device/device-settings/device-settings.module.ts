import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DeviceSettingsPage } from './device-settings';
import { PipesModule } from 'src/app/core/pipes/pipes.module';
import { DeviceIconPageModule } from 'src/app/core/pages/device-icon/device-icon.module';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { FileTransfer } from '@ionic-native/file-transfer/ngx';
import { File } from '@ionic-native/file/ngx';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  { path: "", component: DeviceSettingsPage }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    DeviceIconPageModule,
    ComponentsModule,
    DirectivesModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild()
  ],
  declarations: [
    DeviceSettingsPage,
  ],
  providers: [FileTransfer, File]
})
export class DeviceSettingsPageModule { }

