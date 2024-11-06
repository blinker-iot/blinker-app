import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-slider-edit',
  templateUrl: './widget-slider-edit.component.html',
  styleUrls: ['./widget-slider-edit.component.scss'],
})
export class WidgetSliderEditComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() { }

}
