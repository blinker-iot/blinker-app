import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'number-input',
  templateUrl: './number-input.component.html',
  styleUrls: ['./number-input.component.scss'],
})
export class NumberInputComponent implements OnInit {

  @Input() value;
  @Output() valueChange = new EventEmitter();

  constructor() { }

  ngOnInit() { }

  change(val) {
    this.valueChange.emit(this.value);
  }

  changeValue(val) {
    // console.log(val);
    this.value = val + this.getUnit(this.value)

    this.valueChange.emit(this.value);
  }

  minus() {
    if (!this.value) this.value = '0'
    let val = Number(this.getNum(this.value))
    val = val - 1;
    this.changeValue(val)
  }

  plus() {
    if (!this.value) this.value = '0'
    let val = Number(this.getNum(this.value))
    val = val + 1;
    this.changeValue(val)
  }

  getNum(val) {
    return val.replace('px', '')
  }

  getUnit(val) {
    return 'px'
  }

}
