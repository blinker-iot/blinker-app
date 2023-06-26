import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'blinker-value',
  templateUrl: './value.component.html',
  styleUrls: ['./value.component.scss'],
})
export class ValueComponent implements OnInit {
  @Input() widget;
  constructor() { }

  ngOnInit() {}

}
