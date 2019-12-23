import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
// import { AuthGuard } from '../core/guard/auth.guard';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    // children: [
    //   {
    //     path: '',
    //     redirectTo: '/tabs/home',
    //     pathMatch: 'full',
    //     // canActivate: [AuthGuard] 
    //   },
    //   {
    //     path: 'home',
    //     // loadChildren: '../sections/home/home.module#HomePageModule'
    //     children: [
    //       {
    //         path: '',
    //         loadChildren: '../sections/view/home/home.module#HomePageModule'
    //       }
    //     ]
    //   },
    //   {
    //     path: 'tab2',
    //     // loadChildren: '../sections/home/home.module#HomePageModule'
    //     children: [
    //       {
    //         path: '',
    //         loadChildren: '../test/test.module#TestPageModule'
    //       }
    //     ]
    //   },
    //   {
    //     path: 'user',
    //     loadChildren: '../sections/user/user.module#UserPageModule'
    //     // children: [
    //     //   {
    //     //     path: '',
    //     //     loadChildren: '../sections/user/user.module#UserPageModule'
    //     //   }
    //     // ]
    //   }
  //   ]
  }
];

@NgModule({
  imports: [
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class TabsPageRoutingModule { }
