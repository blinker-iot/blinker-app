import { Routes } from '@angular/router';
import { asHomeTabId } from './home/home-tab-state';

export const routes: Routes = [
  { path: '', redirectTo: 'home/device', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.page').then((m) => m.HomePage),
    children: [
      {
        path: '',
        pathMatch: 'full',
        // Keep old /home?tab=... bookmarks working while removing the query
        // parameter from the resulting URL.
        redirectTo: ({ queryParamMap }) =>
          asHomeTabId(queryParamMap.get('tab')) ?? 'device',
      },
      {
        path: 'device',
        loadComponent: () =>
          import('./home/components/tab-device/tab-device').then(
            (m) => m.TabDeviceComponent
          ),
      },
      {
        path: 'community',
        loadComponent: () =>
          import('./home/components/tab-community/tab-community').then(
            (m) => m.TabCommunityComponent
          ),
      },
      {
        path: 'tools',
        loadComponent: () =>
          import('./home/components/tab-tools/tab-tools').then(
            (m) => m.TabToolsComponent
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./home/components/tab-profile/tab-profile').then(
            (m) => m.TabProfileComponent
          ),
      },
      { path: '**', redirectTo: 'device' },
    ],
  },
  { path: 'login', loadComponent: () => import('./sections/login/login').then(m => m.LoginPage) },
  { path: 'settings', loadComponent: () => import('./sections/settings/settings.page').then(m => m.SettingsPage) },
  {
    path: 'self-hosted-server',
    loadComponent: () => import('./sections/self-hosted-server/self-hosted-server.page').then(m => m.SelfHostedServerPage),
  },
  {
    path: 'third-party-services',
    loadComponent: () =>
      import('./sections/third-party-services/third-party-services.page').then(
        (m) => m.ThirdPartyServicesPage
      ),
  },
  { path: 'feedback', loadComponent: () => import('./sections/feedback/feedback.component').then(m => m.FeedbackPage) },
  { path: 'about', loadComponent: () => import('./sections/about/about.page').then(m => m.AboutPage) },
  { path: 'user', loadComponent: () => import('./sections/user/user.page').then(m => m.UserPage) },
  { path: 'message', loadComponent: () => import('./sections/message/message.page').then(m => m.MessagePage) },
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
    path: 'room-manager',
    loadComponent: () => import('./sections/room/room-manager/room-manager').then(m => m.RoomManagerPage),
  },
  {
    path: 'room-manager/:room',
    loadComponent: () => import('./sections/room/room-edit/room-edit').then(m => m.RoomEditPage),
  },
  {
    path: 'device/:id/settings',
    loadComponent: () => import('./sections/device/device-settings/device-settings').then(m => m.DeviceSettingsPage),
  },
  {
    path: 'device/:id/gateway-enrollment',
    loadComponent: () => import('./sections/device/edge-gateway-enrollment/edge-gateway-enrollment.page')
      .then(m => m.EdgeGatewayEnrollmentPage),
  },
  {
    path: 'device/:id',
    loadComponent: () => import('./device/device.page').then(m => m.DevicePage),
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
