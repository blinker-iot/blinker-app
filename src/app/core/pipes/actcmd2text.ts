import { Pipe, PipeTransform } from '@angular/core';
import { DataService } from '../services/data.service';

@Pipe({
    name: 'actcmd2text'
})
export class Act2TextPipe implements PipeTransform {

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(private dataService: DataService) { }

  transform(cmd, deviceId) {
    let cmdString: string;
    if (typeof cmd != 'string') {
      cmdString = JSON.stringify(cmd)
    } else {
      cmdString = cmd
    }
    const layouter = this.deviceDataDict[deviceId].config.layouter;
    if (!layouter) return;
    const actions = JSON.parse(layouter)?.actions ?? [];
    let text;
    actions.forEach(action => {
      if (JSON.stringify(action.cmd) == cmdString) {
        text = this.processText(action.text, deviceId);
        return false
      }
    });
    return text
  }

  processText(actText: string, deviceId) {
    return actText.replace(/(\?|？)name/g, this.deviceDataDict[deviceId].config.customName)
  }

}
