import { NgModule } from '@angular/core';

import { DevicePage } from './device.page';

/** Compatibility wrapper for the legacy AppModule build path. */
@NgModule({
  imports: [DevicePage],
  exports: [DevicePage],
})
export class BlinkerDeviceModule {}
