import { Component, Input, OnInit } from '@angular/core';
import { Layouter2Service } from '../../layouter2.service';

@Component({
  selector: 'widget-number-edit',
  templateUrl: './widget-number-edit.component.html',
  styleUrls: ['./widget-number-edit.component.scss'],
})
export class WidgetNumberEditComponent implements OnInit {

  @Input() widget;

  constructor(
    private layouterService: Layouter2Service
  ) { }

  ngOnInit() { }

  styleChange($event) {
    if ($event == 2 || $event == 3) {
      this.widget.rows = 2;
      this.widget.cols = 4;
    } else {
      this.widget.rows = 2;
      this.widget.cols = 2;
    }
    this.layouterService.changeWidget(this.widget)
  }

}
