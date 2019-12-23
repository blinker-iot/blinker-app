import { OwnAirStationDashboard } from './own-airstation-dashboard/own-airstation-dashboard';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
  ],
  declarations: [
    OwnAirStationDashboard
  ],
  exports: [
    OwnAirStationDashboard
  ],
  entryComponents: [
    OwnAirStationDashboard
  ]
})

export class OwnAirStationModule { }
