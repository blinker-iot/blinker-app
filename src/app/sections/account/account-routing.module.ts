import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: '',
        children: [
            { path: 'login', loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule) },
            { path: 'register', loadChildren: () => import('./register/register.module').then(m => m.RegisterPageModule) },
            { path: 'retrieve', loadChildren: () => import('./retrieve/retrieve.module').then(m => m.RetrievePageModule) }
        ]
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(routes)
    ],
    exports: [
        RouterModule
    ]
})
export class BlinkerAccountModule { }