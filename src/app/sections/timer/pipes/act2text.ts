import { Pipe, PipeTransform } from '@angular/core';
import { TimerService } from '../timer.service';

@Pipe({
  name: 'act2text',
})
export class Act2TextPipe implements PipeTransform {

  constructor(
    private timerService: TimerService
  ) { }

  transform(act, ...args) {
    let actstr = JSON.stringify(act[0])
    if (typeof this.timerService.currentCmdByAct == 'undefined')
      return actstr
    if (typeof this.timerService.currentCmdByAct[actstr] != 'undefined')
      return this.timerService.currentCmdByAct[actstr]
    return actstr
  }

}
