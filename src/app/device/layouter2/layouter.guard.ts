import { Injectable } from '@angular/core';

import { DevicePage } from '../device.page';

@Injectable({
  providedIn: 'root'
})
export class LayouterGuard  {

  canDeactivate(component: DevicePage) {
    return component.canDeactivate()
  }

}
