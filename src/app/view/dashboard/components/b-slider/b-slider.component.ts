import { Component, ElementRef, EventEmitter, Input, OnInit, Output, Renderer2, ViewChild } from '@angular/core';

@Component({
  selector: 'b-slider',
  templateUrl: './b-slider.component.html',
  styleUrls: ['./b-slider.component.scss'],
})
export class BSliderComponent implements OnInit {

  @ViewChild("bar", { read: ElementRef, static: true }) bar: ElementRef;
  @ViewChild("barActive", { read: ElementRef, static: true }) activeBar: ElementRef;
  @ViewChild("barActive2", { read: ElementRef, static: true }) activeBar2: ElementRef;

  @Input() min = 0;
  @Input() max = 255;
  @Input() direction = 'x';
  // 左侧遮挡
  @Input() activebar = true;
  // 右侧遮挡，实现彩色活动条效果
  @Input() activebar2 = false;

  @Input() text = ''

  @Input()
  get length() {
    if (this.direction == 'x') {
      return this.bar.nativeElement.clientWidth;
    } else {
      return this.bar.nativeElement.clientHeight;
    }
  }
  moveX;

  isMoving = false

  oldInputValue;
  _value;
  @Input()
  set value(value) {
    if (value > this.max) value = this.max;
    if (value < this.min) value = this.min;
    this._value = value;
  };

  get value() {
    return this._value;
  }

  @Output() valueChange = new EventEmitter();

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
    if (this.activebar)
      this.renderer.setStyle(this.activeBar.nativeElement, 'background', color);
    if (this.activebar2)
      this.renderer.setStyle(this.activeBar2.nativeElement, 'background', color);
    this._activebarColor = color;
  }
  get activecolor() {
    return this._activebarColor;
  }

  @Output() sendData = new EventEmitter();

  constructor(
    private renderer: Renderer2,
  ) { }

  ngOnInit() {

  }

  timer;
  ngAfterViewInit() {
    this.timer = setInterval(() => {
      if (!this.isMoving) {
        this.processValue();
      }
    }, 1000)
  }

  ngOnDestroy() {
    clearInterval(this.timer)
  }

  processValue() {
    if (this.oldInputValue != this.value) {
      let x = (this.value - this.min) / (this.max - this.min) * this.length;
      if (this.activebar)
        this.renderer.setStyle(this.activeBar.nativeElement, 'transition', `width 0.5s`);
      if (this.activebar2)
        this.renderer.setStyle(this.activeBar2.nativeElement, 'transition', `width 0.5s`);
      this.moveSlider(x);
      setTimeout(() => {
        if (this.activebar)
          this.renderer.removeStyle(this.activeBar.nativeElement, 'transition');
        if (this.activebar2)
          this.renderer.removeStyle(this.activeBar2.nativeElement, 'transition');
      }, 500);
      this.oldInputValue = this.value;
    }
  }

  moveSlider(move) {
    let barActiveScale = (move / this.length * 100);
    if (this.direction == 'x') {
      if (this.activebar)
        this.renderer.setStyle(this.activeBar.nativeElement, 'width', `${barActiveScale.toString()}%`);
      if (this.activebar2)
        this.renderer.setStyle(this.activeBar2.nativeElement, 'width', `${(100 - barActiveScale).toString()}%`);
    } else {
      if (this.activebar)
        this.renderer.setStyle(this.activeBar.nativeElement, 'height', `${barActiveScale.toString()}%`);
      if (this.activebar2)
        this.renderer.setStyle(this.activeBar2.nativeElement, 'height', `${(100 - barActiveScale).toString()}%`);
    }
    this.value = Math.round(move / this.length * (this.max - this.min) + this.min);
  }

  tapEvent(e) {
    if (this.activebar)
      this.renderer.removeStyle(this.activeBar.nativeElement, 'transition');
    if (this.activebar2)
      this.renderer.removeStyle(this.activeBar2.nativeElement, 'transition');
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p;
    } else {
      let p = e.target.getBoundingClientRect().bottom;
      move = -(e.center.y - p);
    }
    move = this.checkLimit(move);
    this.moveSlider(move);
    this.pick('tap');
  }

  panstartEvent(e) {
    if (this.activebar)
      this.renderer.removeStyle(this.activeBar.nativeElement, 'transition');
    if (this.activebar2)
      this.renderer.removeStyle(this.activeBar2.nativeElement, 'transition');
    this.isMoving = true;
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p;
    } else {
      let p = e.target.getBoundingClientRect().bottom;
      move = -(e.center.y - p);
    }
    move = this.checkLimit(move)
    this.moveSlider(move);
  }

  lastSendTime = 0;
  panmoveEvent(e) {
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p;
    } else {
      let p = e.target.getBoundingClientRect().bottom;
      move = -(e.center.y - p);
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
      this.valueChange.emit(this.value);
    }
    if (state == 'end' || state == 'tap') {
      this.sendData.emit(this.value);
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
