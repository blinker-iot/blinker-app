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
      { path: 'home', loadChildren: () => import('./home/view-home.module').then(m => m.ViewHomePageModule) },
      { path: 'gis', loadChildren: () => import('./gis/view-gis.module').then(m => m.ViewGisPageModule) },
      { path: 'list', loadChildren: () => import('./list/view-list.module').then(m => m.ViewListPageModule) },
      { path: 'dashboard', loadChildren: () => import('./dashboard/dashboard.module').then(m => m.DashboardPageModule) },
      { path: 'card', loadChildren: () => import('./card/card.module').then(m => m.CardPageModule) },
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
