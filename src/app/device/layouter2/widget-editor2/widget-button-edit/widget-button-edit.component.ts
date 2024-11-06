import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-button-edit',
  templateUrl: './widget-button-edit.component.html',
  styleUrls: ['./widget-button-edit.component.scss'],
})
export class WidgetButtonEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() {
    if (!this.widget.mode) {
      this.widget['mode'] = 0;
    }
    // if (!this.widget.css) {
    //   this.widget['css'] = {
    //     'font-size': '14px',
    //     'font-weight': 'normal',
    //     'color': '#000000',
    //     'background': '#ffffff',
    //   }
    // }
    if (!this.widget.background) {
      this.widget['background'] = {
        'display': 'flex',
        'justify-content': 'flex-start',
        'align-items': 'flex-start'
      }
    }
    if (!this.widget.icon) {
      this.widget['icon'] = {
        'font-size': '14px',
        'color': '#000000',
      }
    }
  }

  choseBtnMode(mode) {
    this.widget["mode"] = mode;
  }

  styleChange() {
    this.widget['css']['display'] = 'flex'
    this.widget['css']['justify-content'] = 'center'
    this.widget['css']['align-items'] = 'center'
    switch (this.widget.style) {
      case 0:
        this.widget['css']['flex-direction'] = 'column'
        break;
      case 1:
        this.widget['css']['flex-direction'] = 'row'
        break;
      case 2:
        this.widget['css']['flex-direction'] = 'column'
        break;
      default:
        break;
    }
  }

}
