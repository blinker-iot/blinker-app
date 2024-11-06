import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'widget-video-edit',
  templateUrl: './widget-video-edit.component.html',
  styleUrls: ['./widget-video-edit.component.scss'],
})
export class WidgetVideoEditComponent implements OnInit {
  @Input() widget;

  constructor() { }

  ngOnInit() { }

  chosePlayMode(mode) {

  }

  choseStream(stream) {
    this.widget["str"] = stream;
  }

}
