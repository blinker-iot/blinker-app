import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { DevicePage } from 'src/app/core/device/device.page';

// export interface CanComponentDeactivate {
//   canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
//  }

@Injectable({
  providedIn: 'root'
})
export class LayouterGuard implements CanDeactivate<DevicePage> {

  canDeactivate(component: DevicePage) {
    return component.canDeactivate()
    // ? component.canDeactivate() : component.confirm('界面布局器未保存，是否放弃保存并退出？');
  }

}
