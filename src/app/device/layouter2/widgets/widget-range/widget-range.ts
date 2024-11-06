import { Component, ElementRef, Input, Renderer2, ViewChild } from '@angular/core';
import { Layouter2Widget } from '../config';
import { Layouter2Service } from '../../layouter2.service';
import { convertToRgba } from 'src/app/core/functions/func';

@Component({
  selector: 'widget-range',
  templateUrl: 'widget-range.html',
  styleUrls: ['widget-range.scss']
})
export class WidgetRangeComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get tex() {
    return this.getValue('tex')
  }

  // @ViewChild('rangebox', { read: ElementRef, static: true }) rangebox: ElementRef;

  showValue = 0;
  set value(value) {
    if (typeof this.device.data[this.key] == 'undefined')
      this.device.data[this.key] = {};
    this.device.data[this.key]['val'] = value;
  }

  get value() {
    return this.getValue('val')
  }

  get max() {
    return this.getValue('max')
  }

  get min() {
    return this.getValue('min')
  }

  get ico() {
    return this.getValue('ico')
  }

  get color() {
    return this.getValue('clr')
  }

  get color2() {
    return convertToRgba(this.color, 0.2)
  }

  get state() {
    return this.getValue('swi')
  }

  get mode() {
    return this.getValue('mode')
  }

  get custom() {
    return this.getValue('cus')
  }

  textBoxWidth = '300px'
  // boxPadding = '0 15px'

  get gridSize() {
    return this.layouterService.gridSize
  }

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return
  }

  _lstyle
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined')
      return this._lstyle
    if (typeof this.widget.lstyle != 'undefined')
      return this.widget.lstyle
    return 0;
  }

  constructor(
    private layouterService: Layouter2Service,
    private renderer: Renderer2
  ) {
  }


  timer;
  ngAfterViewInit() {
    this.timer = setInterval(() => {
      if (!this.isMoving) {
        this.processValue();
      }
    }, 1000)
    this.refresh()
  }

  ngOnDestroy() {
    clearInterval(this.timer)
  }

  canSend = true;
  sendData(senddata) {
    this.layouterService.send(`{"${this.key}":${senddata}}\n`);
  }

  refresh() {
    setTimeout(() => {
      this.textBoxWidth = `${this.bar.nativeElement.clientWidth}px`
    }, 100)
  }

  jia() {
    if (typeof this.value == 'undefined') this.value = 0
    if (this.value < this.max) this.value++
    this.sendData(this.value)
  }

  jian() {
    if (typeof this.value == 'undefined') this.value = 0
    if (this.value > this.min) this.value--
    this.sendData(this.value)
  }

  @ViewChild("bar", { read: ElementRef, static: true }) bar: ElementRef;
  @ViewChild("barActive", { read: ElementRef, static: true }) activeBar: ElementRef;

  @Input() direction = 'x';

  @Input()
  get length() {
    if (this.direction == 'x') {
      return this.bar.nativeElement.clientWidth;
    }
  }

  isMoving = false

  oldInputValue;
  // _value;
  // @Input()
  // set value(value) {
  //   if (value > this.max) value = this.max;
  //   if (value < this.min) value = this.min;
  //   this._value = value;
  // };

  // get value() {
  //   return this._value;
  // }

  // @Output() valueChange = new EventEmitter();

  _disabled = false;
  @Input()
  set disabled(disabled) {
    this._disabled = disabled;
  }
  get disabled() {
    return this._disabled;
  }

  _barColor = '#389BEE'
  @Input()
  set barcolor(color) {
    if (color[0] != '#' && color[0] != 'r' && color[0] != 'l') color = '#' + color;
    this.renderer.setStyle(this.bar.nativeElement, 'background', color);
    this._barColor = color;
  }
  get barcolor() {
    return this._barColor;
  }

  _activebarColor = '#389BEE'
  @Input()
  set activecolor(color) {
    if (color[0] != '#' && color[0] != 'r') color = '#' + color;
    this.renderer.setStyle(this.activeBar.nativeElement, 'background', color);
    this._activebarColor = color;
  }
  get activecolor() {
    return this._activebarColor;
  }

  processValue() {
    if (this.oldInputValue != this.value) {
      let x = (this.value - this.min) / (this.max - this.min) * this.length;
      this.renderer.setStyle(this.activeBar.nativeElement, 'transition', `width 0.5s`);
      this.moveSlider(x);
      setTimeout(() => {
        this.renderer.removeStyle(this.activeBar.nativeElement, 'transition');
      }, 500);
      this.oldInputValue = this.value;
    }
  }

  moveSlider(move) {
    let barActiveScale = (move / this.length * 100);
    if (this.direction == 'x') {
      this.renderer.setStyle(this.activeBar.nativeElement, 'width', `${barActiveScale.toString()}%`);
    }
    this.value = Math.round(move / this.length * (this.max - this.min) + this.min);
  }

  tapEvent(e) {
    this.renderer.removeStyle(this.activeBar.nativeElement, 'transition');
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p - 10;
    }
    move = this.checkLimit(move);
    this.moveSlider(move);
    this.pick('tap');
  }

  panstartEvent(e) {
    this.renderer.removeStyle(this.activeBar.nativeElement, 'transition');
    this.isMoving = true;
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p - 10;
    }
    move = this.checkLimit(move)
    this.moveSlider(move);
  }

  lastSendTime = 0;
  panmoveEvent(e) {
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p - 10;
    }
    move = this.checkLimit(move)
    this.moveSlider(move);
    this.pick();
  }

  panendEvent(e) {
    this.isMoving = false;
    this.pick('end');
  }

  oldValue: number;
  pick(state = 'move') {
    if (this.value != this.oldValue) {
      this.oldValue = this.value;
      // this.valueChange.emit(this.value);
    }
    if (state == 'end' || state == 'tap') {
      this.sendData(this.value)
    }
  }

  checkLimit(move) {
    if (move > this.length) {
      move = this.length;
    } else if (move < 0) {
      move = 0;
    }
    return move;
  }
}
