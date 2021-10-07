import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { BlinkerView } from './view.page';
import { AuthGuard } from 'src/app/core/guard/auth.guard';
import { MenuModule } from './menu/menu.module';

const routes: Routes = [
  {
    path: 'view',
    component: BlinkerView,
    // redirectTo:'/view/home',
    // canActivate: [AuthGuard],
    children: [
      { path: 'home', loadChildren: './home/view-home.module#ViewHomePageModule' },
      { path: 'gis', loadChildren: './gis/view-gis.module#ViewGisPageModule' },
      { path: 'list', loadChildren: './list/view-list.module#ViewListPageModule' },
      { path: 'dashboard', loadChildren: './dashboard/dashboard.module#DashboardPageModule' },
      { path: 'card', loadChildren: './card/card.module#CardPageModule' },
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MenuModule,
    RouterModule.forChild(routes)
  ],
  declarations: [BlinkerView]
})
export class BlinkerViewModule { }
