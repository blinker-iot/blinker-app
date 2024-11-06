import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-custom-edit',
  templateUrl: './widget-custom-edit.component.html',
  styleUrls: ['./widget-custom-edit.component.scss'],
})
export class WidgetCustomEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() {
    // if (!this.widget.css) {
    //   this.widget['css'] = {
    //     'font-size': '14px',
    //     'font-weight': 'normal',
    //     'color': '#000000',
    //   }
    // }
    if (!this.widget.background) {
      this.widget['background'] = {
        'display': 'flex',
        'justify-content': 'flex-start',
        'align-items': 'flex-start'
      }
    }
  }

  alignChange(alignCss) {
    this.widget['background']['justify-content'] = alignCss['justify-content'];
    this.widget['background']['align-items'] = alignCss['align-items'];
  }

}
