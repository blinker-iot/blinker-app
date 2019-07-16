import { Component, Input } from '@angular/core';
import { Layout2Component } from '../layout.component';

@Component({
  selector: 'layout2video',
  templateUrl: 'layout2video.html'
})
export class Layout2videoComponent implements Layout2Component {

  @Input() device;
  @Input() layouter={};
  @Input() cols = 2;
  @Input() rows = 1;
  @Input() content = '自定义文本';
  @Input() key = 'key';

  constructor() {

  }

}
