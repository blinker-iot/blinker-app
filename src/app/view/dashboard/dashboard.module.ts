import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { DashboardPage } from './dashboard';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DashboardBlockComponent } from './dashboard-block/dashboard-block';
import { DirectivesModule } from 'src/app/core/directives/directives.module';

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
        RouterModule.forChild(routes),
        DirectivesModule
    ],
    declarations: [DashboardPage,DashboardBlockComponent]
})
export class DashboardPageModule { }