import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: '',
        children: [
            { path: 'login', loadChildren: './login/login.module#LoginPageModule' },
            { path: 'register', loadChildren: './register/register.module#RegisterPageModule' },
            { path: 'retrieve', loadChildren: './retrieve/retrieve.module#RetrievePageModule' }
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