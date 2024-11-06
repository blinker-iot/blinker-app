import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

const routes: Routes = [
  {
    path: "device-manager",
    children: [
      {
        path: "",
        loadChildren: () =>
          import("./device-manager/device-manager.module").then((m) =>
            m.DeviceManagerPageModule
          ),
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./device-settings/device-settings").then((m) =>
            m.DeviceSettingsPage
          ),
      },
      {
        path: ":id/update",
        loadComponent: () =>
          import("./device-update/device-update").then((m) =>
            m.DeviceUpdatePage
          ),
      },
      {
        path: ":id/log",
        loadComponent: () =>
          import("./device-log/device-log.component").then((m) =>
            m.DeviceLogComponent
          ),
      },
      {
        path: ":id/storage",
        loadComponent: () =>
          import("./device-storage/device-storage.page").then((m) =>
            m.DeviceStoragePage
          ),
      },
      {
        path: ":id/timer",
        loadComponent: () =>
          import("./device-timer/device-timer.page").then((m) =>
            m.DeviceTimerPage
          )
      },
      {
        path: ":id/timer/:taskid",
        loadComponent: () =>
          import("./device-timer/timing-edit/timing-edit").then((m) =>
            m.TimingEditPage
          ),
      },
      {
        path: ":id/location",
        loadComponent: () =>
          import("./device-location/device-location.page").then((m) =>
            m.DeviceLocationPage
          ),
      },
      {
        path: ":id/share",
        loadComponent: () =>
          import("./device-share/device-share").then((m) =>
            m.DeviceSharePage
          ),
      },
    ],
  },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
  ],
  exports: [
    RouterModule,
  ],
})
export class BlinkerDeviceManagerModule {}
