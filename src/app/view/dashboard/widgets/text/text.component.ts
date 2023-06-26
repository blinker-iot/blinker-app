import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'blinker-text',
  templateUrl: './text.component.html',
  styleUrls: ['./text.component.scss'],
})
export class TextComponent implements OnInit {
  @Input() widget;
  
  constructor() { }

  ngOnInit() {}

}
