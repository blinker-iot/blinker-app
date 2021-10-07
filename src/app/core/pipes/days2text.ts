import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'days2text',
})
export class Days2TextPipe implements PipeTransform {

  transform(days) {
    if (days == '0000000')
      return '不重复'
    if (days == '1111111')
      return '每天'
    if (days == '0111110')
      return '周一至周五'

    let text = "";
    if (days[0] == '1') text = '周日'
    if (days[1] == '1') text = text + ' 周一'
    if (days[2] == '1') text = text + ' 周二'
    if (days[3] == '1') text = text + ' 周三'
    if (days[4] == '1') text = text + ' 周四'
    if (days[5] == '1') text = text + ' 周五'
    if (days[6] == '1') text = text + ' 周六'
    return text
  }

}
