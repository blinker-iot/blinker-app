import { Component, Input } from '@angular/core';
import { Layout2Component } from '../layout.component';

@Component({
  selector: 'layout2chart',
  templateUrl: 'layout2chart.html'
})
export class Layout2chartComponent implements Layout2Component {

  @Input() device;
  @Input() layouter={};
  @Input() cols = 2;
  @Input() rows = 1;
  @Input() content = '自定义文本';
  @Input() key = 'key';

  constructor() {

  }

}
