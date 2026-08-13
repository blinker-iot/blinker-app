import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { DevicePage } from '../device.page';

// export interface CanComponentDeactivate {
//   canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
//  }

@Injectable({
  providedIn: 'root'
})
export class LayouterGuard implements CanDeactivate<DevicePage> {

  canDeactivate(component: DevicePage) {
    return component.canDeactivate()
  }

}
