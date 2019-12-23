import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'b-colorpicker-btns',
  templateUrl: './b-colorpicker-btns.component.html',
  styleUrls: ['./b-colorpicker-btns.component.scss']
})
export class BColorpickerBtnsComponent implements OnInit {

  colorList = [
    '#595959',
    '#FFF',
    '#EA0909',
    '#00A90C',
    '#076EEF',
    '#6010E4',
    '#FBA613'
  ]

  @Input() selected;
  @Output() selectedChange: EventEmitter<string> = new EventEmitter();

  constructor() { }

  ngOnInit() {
  }

  selectColor(color) {
    this.selected = color;
    this.selectedChange.emit(color);
  }



}
