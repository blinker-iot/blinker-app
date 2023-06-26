import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: 'device-manager',
        children: [
            { path: '', loadChildren: () => import('./device-manager/device-manager.module').then(m => m.DeviceManagerPageModule) },
            { path: ":id", loadChildren: () => import('./device-settings/device-settings.module').then(m => m.DeviceSettingsPageModule) },
            { path: ":id/update", loadChildren: () => import('./device-update/device-update.module').then(m => m.DeviceUpdatePageModule) },
            { path: ":id/location", loadChildren: () => import('./device-location/device-location.module').then(m => m.DeviceLocationPageModule) },
            { path: ":id/log", loadChildren: () => import('./device-log/device-log.module').then(m => m.DeviceLogModule) },
            { path: ":id/ieconfig", loadChildren: () => import('./device-ieconfig/device-ieconfig.module').then(m => m.DeviceIeconfigPageModule) },
            { path: ":id/trigger-config", loadChildren: () => import('./device-trigger/device-trigger.module').then(m => m.DeviceTriggerConfigPageModule) },
            { path: ":id/action-config", loadChildren: () => import('./device-action/device-action.module').then(m => m.DeviceActionConfigPageModule) },
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