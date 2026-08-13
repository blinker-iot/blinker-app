import { Type } from '@angular/core';

import { Customizer } from '../device/customizer/customizer.component';
import { Layouter2 } from '../device/layouter2/layouter2';
import { TestDeviceDashboardComponent } from '../device/test-dashboard/test-device-dashboard.component';

export const deviceComponentDict: Record<string, Type<unknown>> = {
  Layouter2,
  Customizer,
  TestDashboard: TestDeviceDashboardComponent,
};
