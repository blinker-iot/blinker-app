import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-debug-edit',
  templateUrl: './widget-debug-edit.component.html',
  styleUrls: ['./widget-debug-edit.component.scss'],
})
export class WidgetDebugEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() { }

  choseBtnMode(e) {

  }
}
