import { Component, Input, OnInit } from '@angular/core';
// import { DefaultBackgroundCss, TransparentBackgroundCss } from '../../widgets/config';

@Component({
  selector: 'widget-background-edit',
  templateUrl: './background-edit.component.html',
  styleUrls: ['./background-edit.component.scss'],
})
export class BackgroundEditComponent implements OnInit {

  @Input() widget
  // : WidgetData | any;

  constructor() { }

  ngOnInit() {
    if (!this.widget['background'])
      this.init()
  }

  init() {
    // this.widget['background'] = JSON.parse(JSON.stringify(DefaultBackgroundCss))
  }

  clear() {
    // this.widget['background'] = JSON.parse(JSON.stringify(TransparentBackgroundCss))
  }

}
