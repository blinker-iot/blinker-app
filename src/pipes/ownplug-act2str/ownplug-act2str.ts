import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'ownplugAct2str',
})
export class OwnplugAct2strPipe implements PipeTransform {

  transform(act) {
    JSON.stringify(act[0]) == `{"switch":"on"}`
    return ((JSON.stringify(act[0]) == `{"switch":"on"}`) ? '打开设备' : '关闭设备')
  }
}
