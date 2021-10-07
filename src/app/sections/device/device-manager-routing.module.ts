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
            { path: ":id/log", loadChildren: './device-log/device-log.module#DeviceLogModule' },
            { path: ":id/ieconfig", loadChildren: './device-ieconfig/device-ieconfig.module#DeviceIeconfigPageModule' },
            { path: ":id/trigger-config", loadChildren: './device-trigger/device-trigger.module#DeviceTriggerConfigPageModule' },
            { path: ":id/action-config", loadChildren: './device-action/device-action.module#DeviceActionConfigPageModule' },
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