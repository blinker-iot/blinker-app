import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'wrap'
})
export class WrapPipe implements PipeTransform {

  transform(value: any, args?: any): any {
    return value.replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/ /g, `&nbsp;`).replace(/\r\n/g, `<br />`).replace(/\n/g, `<br />`);
  }

}
