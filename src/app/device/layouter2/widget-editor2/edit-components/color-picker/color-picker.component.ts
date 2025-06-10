import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
    selector: 'color-picker',
    templateUrl: './color-picker.component.html',
    styleUrls: ['./color-picker.component.scss'],
    standalone: false
})
export class ColorPickerComponent implements OnInit {

  @Input() value;
  @Output() valueChange = new EventEmitter();

  constructor() { }

  ngOnInit() { }

  change(e) {
    this.value = e
    this.valueChange.emit(this.value);
  }

}
