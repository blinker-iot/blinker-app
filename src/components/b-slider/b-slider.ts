import {
  Component,
  ViewChild,
  ElementRef,
  Renderer2,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
  // forwardRef
} from '@angular/core';
import { Events, Gesture } from 'ionic-angular';
// import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
declare var Hammer: any;

@Component({
  selector: 'b-slider',
  templateUrl: 'b-slider.html',
  // providers: [
  //   {
  //     provide: NG_VALUE_ACCESSOR,
  //     useExisting: forwardRef(() => BSliderComponent),
  //     multi: true
  //   }
  // ]
})
// export class BSliderComponent implements ControlValueAccessor {
export class BSliderComponent {
  @ViewChild("bar", { read: ElementRef }) bar: ElementRef;
  @ViewChild("barActive", { read: ElementRef }) barActive: ElementRef;
  @ViewChild("knob", { read: ElementRef }) knob: ElementRef;
  @ViewChild("touchBar", { read: ElementRef }) touchBar: ElementRef;

  // _length;
  @Input()
  get length() {
    if (this.direction == 'x') {
      return this.bar.nativeElement.clientWidth;
    } else {
      return this.bar.nativeElement.clientHeight;
    }

  }
  moveX;
  gesture: Gesture;
  showValue = false;

  _value = 0;
  @Input()
  set value(value) {
    window.setTimeout(() => {
      // console.log("set value");
      // console.log(value);
      // console.log(this.max);
      // console.log(this.length);
      if (value > this.max) value = this.max;
      if (value < this.min) value = this.min;
      this._value = value;
      let x = (value - this.min) / (this.max - this.min) * this.length;
      this.moveSlider(x);
    }, 50);
  };
  get value(): number {
    return this._value;
  }

  _disabled = false;
  @Input()
  set disabled(disabled) {
    this._disabled = disabled;
  }
  get disabled() {
    return this._disabled;
  }
  @Input() min = 0;
  @Input() max = 100;
  @Input() direction = 'x';
  _color = '#389BEE'
  @Input()
  set color(color) {
    if (color[0] != '#' && color[0] != 'r') color = '#' + color;
    this.renderer.setStyle(this.barActive.nativeElement, 'background', color);
    this._color = color;
  }
  get color() {
    return this._color;
  }

  // @Input() mode;

  @Output() update = new EventEmitter();
  @Output() sendData = new EventEmitter();

  constructor(
    public events: Events,
    private renderer: Renderer2,
    public changeDetectorRef: ChangeDetectorRef,
  ) {
  }

  ngAfterViewInit() {
    this.listenGesture();
    // this.value = this.value;
  }

  listenGesture() {
    // if (typeof this.gesture != 'undefined') return;
    this.gesture = new Gesture(this.touchBar.nativeElement, {
      recognizers: [
        [Hammer.Pan, { threshold: 1, direction: Hammer.DIRECTION_ALL }],
        [Hammer.Tap]
      ]
    });
    this.gesture.listen();
    this.gesture.on('tap', e => this.tapEvent(e));
    this.gesture.on('panstart', e => this.panstartEvent(e));
    this.gesture.on('panmove', e => this.panmoveEvent(e));
    this.gesture.on('panend', e => this.panendEvent(e));
  }

  unlistenGesture() {
    this.gesture.unlisten();
  }

  moveSlider(move) {
    let barActiveScale = (move / this.length * 100);
    let knobScale = (move / (this.length + 20) * 100);
    if (this.direction == 'x') {
      this.renderer.setStyle(this.knob.nativeElement, 'left', `${knobScale.toString()}%`);
      this.renderer.setStyle(this.barActive.nativeElement, 'width', `${barActiveScale.toString()}%`);
    } else {
      this.renderer.setStyle(this.knob.nativeElement, 'bottom', `${knobScale.toString()}%`);
      this.renderer.setStyle(this.barActive.nativeElement, 'height', `${barActiveScale.toString()}%`);
    }
    this._value = Math.round(move / this.length * (this.max - this.min) + this.min);
    // console.log(this._value);
  }

  tapEvent(e) {
    // console.log(e);
    if (this.disabled) return;
    let move;
    if (this.direction == 'x') {
      let p = e.target.getBoundingClientRect().left;
      move = e.center.x - p - 10;
    } else {
      let p = e.target.getBoundingClientRect().bottom;
      move = -(e.center.y - p) - 10;
    }
    move = this.checkLimit(move);
    this.moveSlider(move);
    // this.displayValue();
    // this.onChangeCallback(this._value)
    this.pick('tap');
  }

  oldP;
  panstartEvent(e) {
    if (this.disabled) return;
    let move;
    let p;
    if (this.direction == 'x') {
      p = e.target.getBoundingClientRect().left;
      move = e.center.x - p - 10;
      // this.oldP = this.knob.nativeElement.offsetLeft;
      this.oldP = move;
    } else {
      p = e.target.getBoundingClientRect().bottom;
      move = -(e.center.y - p) - 10;
      this.oldP = move;
      // this.knob.nativeElement.offsetHeight - this.length;
      // console.log(this.oldP);
    }
    move = this.checkLimit(move)
    this.moveSlider(move);
  }

  lastSendTime = 0;
  panmoveEvent(e) {
    if (this.disabled) return;
    let move;
    if (this.direction == 'x') {
      move = this.oldP + e.deltaX;
    }
    else {
      // console.log(this.oldP);
      move = this.oldP - e.deltaY;
    }
    // console.log(move);
    move = this.checkLimit(move)
    this.moveSlider(move);
    // this.displayValue();
    // this.onChangeCallback(this._value)
    this.pick();
  }

  panendEvent(e) {
    if (this.disabled) return;
    this.pick('end');
  }

  oldValue: number;
  pick(state = 'move') {
    // console.log(this.value);
    if (this._value != this.oldValue) {
      this.oldValue = this._value;
      // console.log(this.value);
      this.update.emit(this._value);
    }
    if (state == 'end' || state == 'tap') {
      // console.log(state)
      this.sendData.emit(this._value);
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

  // // 以下为ControlValueAccessor接口

  // writeValue(value: any) {
  //   this.value = value;
  // }

  // registerOnChange(fn: any) {
  //   this.onChangeCallback = fn;
  // }

  // registerOnTouched(fn: any) {
  //   // this.onTouchedCallback = fn;
  // }

  // private onChangeCallback: Function = () => { 

  // };


}
