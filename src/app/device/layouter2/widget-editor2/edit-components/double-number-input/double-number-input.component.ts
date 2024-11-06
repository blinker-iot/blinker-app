import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'double-number-input',
  templateUrl: './double-number-input.component.html',
  styleUrls: ['./double-number-input.component.scss'],
})
export class DoubleNumberInputComponent implements OnInit {
  @Input() mode = 1;
  @Input() value;
  @Input() value2;
  @Output() valueChange = new EventEmitter();
  @Output() value2Change = new EventEmitter();
  @Input() valueMax = 100;
  @Input() valueMin = 0;
  @Input() value2Max = 100;
  @Input() value2Min = 0;

  constructor() { }

  ngOnInit() { }

  change(e) {
    this.valueChange.emit(this.value);
  }

  change2(e) {
    this.value2Change.emit(this.value2);
  }

  // changeValue(val) {
  //   console.log(val);
  //   // this.value = val + this.getUnit(this.value)
  //   this.valueChange.emit(this.value);
  // }

  minus() {
    this.value = this.value - 1;
    if (this.value < this.valueMin) {
      this.value = this.valueMin;
    }
    this.change(this.value)
  }

  plus() {
    this.value = this.value + 1;
    if (this.value > this.valueMax) {
      this.value = this.valueMax;
    }
    this.change(this.value)
  }

  minus2() {
    this.value2 = this.value2 - 1;
    if (this.value2 < this.value2Min) {
      this.value2 = this.value2Min;
    }
    this.change2(this.value2)
  }

  plus2() {
    this.value2 = this.value2 + 1;
    if (this.value2 > this.value2Max) {
      this.value2 = this.value2Max;
    }
    this.change2(this.value2)
  }

  // getNum(val) {
  //   return val.replace('px', '')
  // }

  // getUnit(val) {
  //   return 'px'
  // }

}
