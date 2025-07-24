import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { BlinkerView } from './view.page';
import { Menu } from './home/components/menu/menu';

const routes: Routes = [
  {
    path: 'view',
    component: BlinkerView,
    children: [
      { path: 'home', loadChildren: () => import('./home/view-home.module').then(m => m.ViewHomePageModule) },
    ]
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    Menu,
    RouterModule.forChild(routes)
  ],
  declarations: [BlinkerView]
})
export class BlinkerViewModule { }
