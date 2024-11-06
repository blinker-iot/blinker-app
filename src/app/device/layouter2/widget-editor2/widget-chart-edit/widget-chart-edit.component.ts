import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-chart-edit',
  templateUrl: './widget-chart-edit.component.html',
  styleUrls: ['./widget-chart-edit.component.scss'],
})
export class WidgetChartEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() { }

  ngOnDestroy(): void {
    this.widget.items = this.widget.items.filter((item) => item.key != "");
  }

  addItem() {
    this.widget.items.push({
      "color": "#389bee",
      "type": "line",
      "key": "",
      "name": ""
    });
  }
}
