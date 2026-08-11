import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./home/home.page').then(m => m.HomePage) },
  { path: 'login', loadComponent: () => import('./sections/login/login').then(m => m.LoginPage) },
  { path: 'settings', loadComponent: () => import('./sections/settings/settings.page').then(m => m.SettingsPage) },
  { path: 'user', loadComponent: () => import('./sections/user/user.page').then(m => m.UserPage) },
  { path: 'message', loadComponent: () => import('./sections/message/message.page').then(m => m.MessagePage) },
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
