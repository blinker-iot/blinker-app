import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-select-edit',
  templateUrl: './widget-select-edit.component.html',
  styleUrls: ['./widget-select-edit.component.scss'],
})
export class WidgetSelectEditComponent implements OnInit {

  @Input() widget;

  value = 0;

  constructor() { }

  ngOnInit() { }

  ngOnDestroy(): void {
    this.widget.opts = this.widget.opts.filter((item) => item.value != "");
  }

  addItem() {
    this.widget.opts.push({
      "clr": "#389bee",
      "ico": "fa-regular fa-circle-" + (this.widget.opts.length + 1),
      "value": "",
      "name": ""
    });
  }
}
