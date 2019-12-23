import { Pipe, PipeTransform } from '@angular/core';
// import { getCmdList } from 'src/app/devices/config'
@Pipe({
  name: 'objToStr',
})
export class ObjToStrPipe implements PipeTransform {

  transform(obj, ...args) {
    return this.objToStr(obj);
  }

  objToStr(obj): string {
    return JSON.stringify(obj);
  }

}
