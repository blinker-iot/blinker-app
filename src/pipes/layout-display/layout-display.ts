import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'layoutPipe',
})
export class LayoutDisplayPipe implements PipeTransform {

  transform(value: string): any {
    //空格替换为&ensp; 
    //换行替换为<br />
    // value.replace(/ /g, "&ensp;").replace(/\n/g, "<br />");
    return value.replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/ /g, `&nbsp;`).replace(/\r\n/g, `<br />`).replace(/\n/g, `<br />`);
  }
}
