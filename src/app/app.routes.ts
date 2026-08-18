import { Routes } from '@angular/router';
import { LayouterGuard } from './device/layouter2/layouter.guard';
import { AuthGuard } from './core/guard/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./home/home.page').then(m => m.HomePage), canActivate: [AuthGuard] },
  { path: 'login', loadComponent: () => import('./sections/login/login').then(m => m.LoginPage) },
  { path: 'settings', loadComponent: () => import('./sections/settings/settings.page').then(m => m.SettingsPage) },
  {
    path: 'self-hosted-server',
    loadComponent: () => import('./sections/self-hosted-server/self-hosted-server.page').then(m => m.SelfHostedServerPage),
  },
  { path: 'feedback', loadComponent: () => import('./sections/feedback/feedback.component').then(m => m.FeedbackPage) },
  { path: 'about', loadComponent: () => import('./sections/about/about.page').then(m => m.AboutPage) },
  { path: 'user', loadComponent: () => import('./sections/user/user.page').then(m => m.UserPage), canActivate: [AuthGuard] },
  { path: 'message', loadComponent: () => import('./sections/message/message.page').then(m => m.MessagePage), canActivate: [AuthGuard] },
  {
    path: 'guide',
    pathMatch: 'full',
    loadComponent: () => import('./sections/guide/guide.page').then(m => m.GuidePage),
  },
  {
    path: 'guide/wifi',
    loadComponent: () => import('./sections/guide/wifi-device/wifi-device.page').then(m => m.WifiDeviceGuidePage),
  },
  {
    path: 'guide/ble',
    loadComponent: () => import('./sections/guide/ble-device/ble-device.page').then(m => m.BleDeviceGuidePage),
  },
  {
    path: 'guide/key',
    loadComponent: () => import('./sections/guide/key-device/key-device.page').then(m => m.KeyDeviceGuidePage),
  },
  {
    path: 'old-device',
    loadComponent: () => import('./sections/guide/old-device/old-device.page').then(m => m.OldDevicePage),
  },
  {
    path: 'room-manager',
    loadComponent: () => import('./sections/room/room-manager/room-manager').then(m => m.RoomManagerPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'room-manager/:room',
    loadComponent: () => import('./sections/room/room-edit/room-edit').then(m => m.RoomEditPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'scene-manager',
    loadComponent: () => import('./sections/scene/scene-manager/scene-manager').then(m => m.SceneManager),
    canActivate: [AuthGuard],
  },
  {
    path: 'scene-manager/:scene',
    loadComponent: () => import('./sections/scene/scene-editor/scene-edit').then(m => m.SceneEditor),
    canActivate: [AuthGuard],
  },
  {
    path: 'share-manager',
    loadComponent: () => import('./sections/device/share-manager/share-manager.page').then(m => m.ShareManagerPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'share-manager/:id',
    loadComponent: () => import('./sections/device/device-share/device-share').then(m => m.DeviceSharePage),
    canActivate: [AuthGuard],
  },
  {
    path: 'device/:id',
    loadComponent: () => import('./device/device.page').then(m => m.DevicePage),
    canActivate: [AuthGuard],
    canDeactivate: [LayouterGuard],
  },
  {
    path: 'device-manager/:id',
    loadComponent: () => import('./sections/device/device-settings/device-settings').then(m => m.DeviceSettingsPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'tools/esp32-provision',
    loadComponent: () => import('./tools/esp32-provision/esp32-provision.page').then(m => m.Esp32ProvisionPage),
  },
  {
    path: 'tools/ble-debug',
    loadComponent: () => import('./tools/ble-debug/ble-debug.page').then(m => m.BleDebugPage),
  },
  {
    path: 'tools/lan-discovery',
    loadComponent: () => import('./tools/lan-discovery/lan-discovery.page').then(m => m.LanDiscoveryPage),
  },
  {
    path: 'tools/ble-ota',
    loadComponent: () => import('./tools/ble-ota/ble-ota.page').then(m => m.BleOtaPage),
  },
  {
    path: 'tools/wifi-ota',
    loadComponent: () => import('./tools/wifi-ota/wifi-ota.page').then(m => m.WifiOtaPage),
  },
];
