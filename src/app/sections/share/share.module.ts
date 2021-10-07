import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ShareService } from './share.service';
import { ComponentsModule } from 'src/app/core/components/components.module';
import { ShareManagerPage } from './share-manager/share-manager';
import { ShareEditPage } from './share-edit/share-edit';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { DirectivesModule } from 'src/app/core/directives/directives.module';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
    {
        path: 'share-manager',
        children: [
            { path: '', component: ShareManagerPage },
            { path: ':id', component: ShareEditPage }
        ]
    }
];

@NgModule({
    imports: [
        CommonModule,
        IonicModule,
        ComponentsModule,
        RouterModule.forChild(routes),
        DirectivesModule,
        TranslateModule.forChild()
    ],
    declarations: [
        ShareManagerPage,
        ShareEditPage
    ],
    exports: [
        RouterModule
    ],
    providers: [
        ShareService
    ]
})
export class BlinkerShareManagerModule { }