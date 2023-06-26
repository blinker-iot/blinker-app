import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'blinker-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent implements OnInit {

  @Input() widget;

  constructor() { }

  ngOnInit() { }

}
