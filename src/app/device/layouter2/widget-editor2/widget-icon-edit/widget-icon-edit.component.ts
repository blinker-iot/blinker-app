import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-icon-edit',
  templateUrl: './widget-icon-edit.component.html',
  styleUrls: ['./widget-icon-edit.component.scss'],
})
export class WidgetIconEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() { }

}
