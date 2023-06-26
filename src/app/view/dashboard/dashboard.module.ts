import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DashboardPage } from './dashboard';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { GridsterModule } from 'angular-gridster2';
import { WidgetsModule } from './widgets/widgets.module';

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
        DirectivesModule,
        GridsterModule,
        WidgetsModule
    ],
    declarations: [DashboardPage]
})
export class DashboardPageModule { }