import { Type } from '@angular/core';

import { Customizer } from '../device/customizer/customizer.component';
import { Layouter2Component } from '../device/layouter2/layouter2';
import { TestDeviceDashboardComponent } from '../device/test-dashboard/test-device-dashboard.component';
import { DeviceV2Page } from '../device/v2/device-v2.page';

export const deviceComponentDict: Record<string, Type<unknown>> = {
  Layouter2: Layouter2Component,
  Layouter2Component,
  Customizer,
  DeviceV2: DeviceV2Page,
  TestDashboard: TestDeviceDashboardComponent,
};
