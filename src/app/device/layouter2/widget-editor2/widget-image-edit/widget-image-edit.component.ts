import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-image-edit',
  templateUrl: './widget-image-edit.component.html',
  styleUrls: ['./widget-image-edit.component.scss'],
})
export class WidgetImageEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() { }

}
