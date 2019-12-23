import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'msToDate',
})
export class MsToDatePipe implements PipeTransform {
  transform(msdate:number) {
    let date=new Date(msdate*1000)
    return date.getFullYear() + "." + (date.getMonth() + 1) + "." + date.getDate();
  }
}
