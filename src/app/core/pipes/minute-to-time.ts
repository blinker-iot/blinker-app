import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'minuteToTime',
})
export class MinuteToTimePipe implements PipeTransform {

  transform(minute: any, ...args) {
    return this.minuteToTime(minute);
  }

  minuteToTime(minute): string {
    let h = Math.floor(minute / 60);
    let time = "";
    let m = Math.floor(minute % 60);
    if (h < 10) time = "0" + h + ":";
    else time = h + ":";
    if (m < 10) time += "0" + m;
    else time += m;
    return time;
  }
}
