import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DashboardPage } from './dashboard';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DashboardBlockComponent } from './dashboard-block/dashboard-block';

const routes: Routes = [
    {
        path: '',
        component: DashboardPage
    }
];

@NgModule({
    imports: [
        CommonModule,
        IonicModule,
        ComponentsModule,
        RouterModule.forChild(routes)
    ],
    declarations: [DashboardPage,DashboardBlockComponent]
})
export class DashboardPageModule { }