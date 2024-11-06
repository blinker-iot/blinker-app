import { Component, Input, OnInit } from '@angular/core';
import { Layouter2Service } from '../../layouter2.service';

@Component({
  selector: 'widget-base-edit',
  templateUrl: './base-edit.component.html',
  styleUrls: ['./base-edit.component.scss'],
})
export class WidgetBaseEditComponent implements OnInit {

  @Input() widget;

  constructor(
    private layouterService: Layouter2Service
  ) { }

  ngOnInit() { }


  valueChange() {
    this.layouterService.changeWidget()
  }

}
