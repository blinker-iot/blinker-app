import { Type } from '@angular/core';
import { Customizer } from '../device/customizer/customizer.component';
import { LegacyPanelComponent } from '../device/legacy-panel/legacy-panel.component';
import { TestDeviceDashboardComponent } from '../device/test-dashboard/test-device-dashboard.component';
import { DeviceV2Page } from '../device/v2/device-v2.page';

export const deviceComponentDict: Record<string, Type<unknown>> = {
  Layouter2: LegacyPanelComponent,
  Layouter2Component: LegacyPanelComponent,
  Customizer,
  DeviceV2: DeviceV2Page,
  TestDashboard: TestDeviceDashboardComponent,
};
