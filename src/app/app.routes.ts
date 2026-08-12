import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./home/home.page').then(m => m.HomePage) },
  { path: 'login', loadComponent: () => import('./sections/login/login').then(m => m.LoginPage) },
  { path: 'settings', loadComponent: () => import('./sections/settings/settings.page').then(m => m.SettingsPage) },
  {
    path: 'self-hosted-server',
    loadComponent: () => import('./sections/self-hosted-server/self-hosted-server.page').then(m => m.SelfHostedServerPage),
  },
  { path: 'feedback', loadComponent: () => import('./sections/feedback/feedback.component').then(m => m.FeedbackPage) },
  { path: 'about', loadComponent: () => import('./sections/about/about.page').then(m => m.AboutPage) },
  { path: 'user', loadComponent: () => import('./sections/user/user.page').then(m => m.UserPage) },
  { path: 'message', loadComponent: () => import('./sections/message/message.page').then(m => m.MessagePage) },
  {
    path: 'adddevice',
    loadComponent: () => import('./sections/adddevice/adddevice').then(m => m.AddDevicePage),
  },
  {
    path: 'room-manager',
    loadComponent: () => import('./sections/room/room-manager/room-manager').then(m => m.RoomManagerPage),
  },
  {
    path: 'scene-manager',
    loadComponent: () => import('./sections/scene/scene-manager/scene-manager').then(m => m.SceneManager),
  },
  {
    path: 'share-manager',
    loadComponent: () => import('./sections/device/share-manager/share-manager.page').then(m => m.ShareManagerPage),
  },
  {
    path: 'share-manager/:id',
    loadComponent: () => import('./sections/device/device-share/device-share').then(m => m.DeviceSharePage),
  },
  {
    path: 'device/:id',
    loadComponent: () => import('./device/device.page').then(m => m.DevicePage),
  },
  {
    path: 'device-manager/:id',
    loadComponent: () => import('./sections/device/device-settings/device-settings').then(m => m.DeviceSettingsPage),
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
