import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: 'device-manager',
        children: [
            { path: '', loadChildren: './device-manager/device-manager.module#DeviceManagerPageModule' },
            { path: ":id", loadChildren: './device-settings/device-settings.module#DeviceSettingsPageModule' },
            { path: ":id/update", loadChildren: './device-update/device-update.module#DeviceUpdatePageModule' },
            { path: ":id/location", loadChildren: './device-location/device-location.module#DeviceLocationPageModule' },
            { path: ":id/ieconfig", loadChildren: './device-ieconfig/device-ieconfig.module#DeviceIeconfigPageModule' },
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
export class BlinkerDeviceManagerModule { }