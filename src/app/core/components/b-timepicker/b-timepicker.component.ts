import { Component, OnInit, ViewChild, ElementRef, Input, Output, EventEmitter } from '@angular/core';
import Picker from 'pickerjs';

@Component({
  selector: 'b-timepicker',
  templateUrl: './b-timepicker.component.html',
  styleUrls: ['./b-timepicker.component.scss'],
})
export class BTimepickerComponent {

  timePicker;

  @Input() time: string = "00:00";
  @Output() timeChange = new EventEmitter();

  @ViewChild('timepickerinput', { read: ElementRef, static: true }) timePickerInput: ElementRef;
  @ViewChild('timepickerbox', { read: ElementRef, static: true }) timePickerBox: ElementRef;

  constructor() { }

  ngOnDestroy() {
    this.timePicker.destroy()
  }

  ngAfterViewInit() {
    this.timePicker = new Picker(this.timePickerInput.nativeElement, {
      container: this.timePickerBox.nativeElement,
      format: 'HH:mm',
      headers: true,
      text: {
        title: '选择时间',
        cancel: '取消',
        confirm: '确认',
        hour: '时',
        minute: '分',
      },
      pick: () => { this.valueChanged() }
    });
  }

  valueChanged() {
    let newtime = this.timePicker.getDate('HH:mm')
    this.timeChange.emit(newtime);
  }



}
