import { Routes, RouterStateSnapshot } from '@angular/router';
import { deploymentGuard } from './core/injectable/deployment.guard';
import { LayouterGuard } from './device/layouter2/layouter.guard';
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
        canDeactivate: [(component: { canDeactivate(): Promise<boolean> }) => component.canDeactivate()],
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
  { path: 'message', canMatch: [deploymentGuard('messages')], loadComponent: () => import('./sections/message/message.page').then(m => m.MessagePage) },
  {
    path: 'guide',
    pathMatch: 'full',
    loadComponent: () => import('./sections/guide/guide.page').then(m => m.GuidePage),
  },
  {
    path: 'guide/wifi',
    canMatch: [deploymentGuard('directAccess')],
    loadComponent: () => import('./sections/guide/wifi-device/wifi-device.page').then(m => m.WifiDeviceGuidePage),
  },
  {
    path: 'guide/ble',
    canMatch: [deploymentGuard('directAccess')],
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
    canMatch: [deploymentGuard('directAccess')],
    loadComponent: () => import('./sections/device/edge-gateway-enrollment/edge-gateway-enrollment.page')
      .then(m => m.EdgeGatewayEnrollmentPage),
  },
  {
    path: 'scene-manager',
    pathMatch: 'full',
    redirectTo: 'automation-manager',
  },
  {
    path: 'scene-manager/:scene',
    redirectTo: 'scene-archive',
  },
  {
    path: 'scene-archive',
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
    path: 'automation-manager',
    canMatch: [deploymentGuard('automation')],
    loadComponent: () => import('./sections/scene/automation/automation.page').then(m => m.AutomationPage),
    canDeactivate: [(component: { canDeactivate(): Promise<boolean> | boolean }) => component.canDeactivate()],
  },
  {
    path: 's/:token',
    canMatch: [deploymentGuard('consoleLinks')],
    loadComponent: () => import('./sections/device/shared-console/shared-console.page').then(m => m.SharedConsolePage),
  },
  {
    path: 'share-invitation',
    loadComponent: () => import('./sections/device/share-invitation/share-invitation.page').then(m => m.ShareInvitationPage),
  },
  {
    path: 'share-invitation/:code',
    loadComponent: () => import('./sections/device/share-invitation/share-invitation.page').then(m => m.ShareInvitationPage),
  },
  {
    path: 'device/:id/edit/custom',
    data: { method: 'custom', returnToDevice: true },
    loadComponent: () => import('./sections/device/device-uic/device-uic.page').then(m => m.DeviceUicPage),
    canDeactivate: [(component: { canDeactivate(): Promise<boolean> | boolean }) => component.canDeactivate()],
  },
  {
    path: 'device/:id/edit/widget/:widgetId',
    loadComponent: () => import('./sections/device/panel-editor/panel-widget-editor.page').then(m => m.PanelWidgetEditorPage),
    canDeactivate: [(component: { canDeactivate(nextUrl?: string): Promise<boolean> },
      _route: unknown, _state: unknown, next: RouterStateSnapshot) => component.canDeactivate(next.url)],
  },
  {
    path: 'device/:id/edit',
    loadComponent: () => import('./sections/device/panel-editor/panel-editor.page').then(m => m.PanelEditorPage),
    canDeactivate: [(component: { canDeactivate(nextUrl?: string): Promise<boolean> },
      _route: unknown, _state: unknown, next: RouterStateSnapshot) => component.canDeactivate(next.url)],
  },
  {
    path: 'device/:id',
    loadComponent: () => import('./device/device.page').then(m => m.DevicePage),
    canDeactivate: [LayouterGuard],
  },
  {
    path: 'device-manager/:id/timer',
    canMatch: [deploymentGuard('tasks')],
    loadComponent: () => import('./sections/device/device-timer/device-timer.page').then(m => m.DeviceTimerPage),
  },
  {
    path: 'device-manager/:id/timer/:taskid',
    canMatch: [deploymentGuard('tasks')],
    loadComponent: () => import('./sections/device/device-timer/timing-edit/timing-edit').then(m => m.TimingEditPage),
  },
  {
    path: 'device-manager/:id/location',
    loadComponent: () => import('./sections/device/device-location/device-location.page').then(m => m.DeviceLocationPage),
  },
  {
    path: 'device-manager/:id/logs',
    loadComponent: () => import('./sections/device/device-log/device-log.component').then(m => m.DeviceLogComponent),
  },
  {
    path: 'device-manager/:id/storage',
    loadComponent: () => import('./sections/device/device-storage/device-storage.page').then(m => m.DeviceStoragePage),
  },
  {
    path: 'device-manager/:id/trends',
    loadComponent: () => import('./sections/device/device-trends/device-trends.page').then(m => m.DeviceTrendsPage),
  },
  {
    path: 'device-manager/:id/update',
    loadComponent: () => import('./sections/device/device-update/device-update').then(m => m.DeviceUpdatePage),
  },
  {
    path: 'device-manager/:id/uic',
    pathMatch: 'full',
    loadComponent: () => import('./sections/device/device-uic/device-uic.page').then(m => m.DeviceUicPage),
  },
  {
    path: 'device-manager/:id/uic/custom',
    data: { method: 'custom' },
    loadComponent: () => import('./sections/device/device-uic/device-uic.page').then(m => m.DeviceUicPage),
    canDeactivate: [(component: { canDeactivate(): Promise<boolean> | boolean }) => component.canDeactivate()],
  },
  {
    path: 'device-manager/:id/uic/automatic',
    data: { method: 'automatic' },
    loadComponent: () => import('./sections/device/device-uic/device-uic.page').then(m => m.DeviceUicPage),
  },
  {
    path: 'device-manager/:id/uic/ai',
    data: { method: 'ai' },
    loadComponent: () => import('./sections/device/device-uic/device-uic.page').then(m => m.DeviceUicPage),
  },
  {
    path: 'device-manager/:id/component-preview',
    loadComponent: () => import('./sections/device/component-preview/component-preview.page').then(m => m.ComponentPreviewPage),
  },
  {
    path: 'device-manager/:id/components',
    loadComponent: () => import('./sections/device/device-components/device-components.page').then(m => m.DeviceComponentsPage),
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
