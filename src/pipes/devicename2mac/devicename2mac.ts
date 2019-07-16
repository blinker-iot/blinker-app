import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'devicename2macPipe',
})
export class Devicename2macPipe implements PipeTransform {

  transform(deviceName: string): string {
    return deviceName.substr(0, 12);
  }
}
