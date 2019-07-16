import { Component, Input, ElementRef, ViewChild, Renderer2, ChangeDetectorRef, ViewChildren, QueryList } from '@angular/core';
import { Events } from 'ionic-angular';
import { Layout2Component } from '../layout.component';
import { Gesture } from 'ionic-angular';
declare var Hammer: any;

@Component({
  selector: 'layout2button',
  templateUrl: 'layout2button.html'
})
export class Layout2buttonComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {
    editMode: true
  };
  @Input() t0;
  @Input() t1;
  _key;
  @Input()
  set key(key) {
    this.unsubscribe(this._key);
    this.subscribe(key);
    this._key = key;
  }
  get key() {
    return this._key;
  }
  @Input() ico = 'fal fa-power-off';

  _color = '#959595';
  @Input()
  set color(color) {
    window.setTimeout(() => {
      if (typeof this.roundList != "undefined")
        this.changeColor(color);
      this._color = color;
    }, 60);
  }
  get color() {
    return this._color
  }

  @Input() state = 'off';
  @Input() lstyle = 0;

  _disabled = false;
  @Input()
  set disabled(disabled) {
    // if (disabled) {
    //   this.unlistenGesture();
    // } else {
    //   this.listenGesture();
    // }
    this._disabled = disabled;
  }
  get disabled() {
    return this._disabled
  }

  @Input() mode = 0;
  @Input() custom = " ";

  @ViewChild("button", { read: ElementRef }) button: ElementRef;
  @ViewChildren('round') roundList: QueryList<ElementRef>;
  gesture: Gesture;

  constructor(
    public events: Events,
    public render: Renderer2,
    private changeDetectorRef: ChangeDetectorRef,
  ) {

  }

  ngAfterViewInit() {
    this.listenGesture();
    if (typeof (this.device) != 'undefined') {
      window.setTimeout(() => {
        this.subscribe(this.key);
      }, 200);
    }
  }

  ngOnDestroy() {
    this.unsubscribe(this.key);
  }

  listenGesture() {
    this.gesture = new Gesture(this.button.nativeElement,
      {
        recognizers: [
          [Hammer.Press, { time: 200, threshold: 99 }],
          [Hammer.Tap,]
        ]
      }
    );
    this.gesture.listen();
    this.gesture.on('tap', e => this.tapEvent(e));
    this.gesture.on('press', e => this.pressEvent(e));
    this.gesture.on('pressup', e => this.pressupEvent(e));
  }

  unlistenGesture() {
    if (typeof this.gesture != 'undefined')
      this.gesture.unlisten();
  }

  pressEvent(event) {
    if (this.layouter.editMode) return;
    let data = `{"${this.key}":"press"}\n`;
    this.events.publish('layout:send', data);
    // console.log(data);
  }

  pressupEvent(event) {
    if (this.layouter.editMode) return;
    let data = `{"${this.key}":"pressup"}\n`;
    this.events.publish('layout:send', data);
    // console.log(data);
  }

  tapEvent(event) {
    // console.log(this.layouter);
    if (this.layouter.editMode) return;
    let data;
    if (this.mode == 0) {
      data = `{"${this.key}":"tap"}`;
    } else if (this.mode == 1) {
      // console.log(this.state);
      data = (this.state == 'off') ? `{"${this.key}":"on"}` : `{"${this.key}":"off"}`;
    } else if (this.mode == 2) {
      data = `{"${this.key}":"${this.custom}"}`;
    }
    this.events.publish('layout:send', data + '\n');
    navigator.vibrate(10);
    // console.log(data);
  }

  changeColor(color = '#959595') {
    if (color[0] != '#' && color[0] != 'r') color = '#' + color;
    this.render.setStyle(this.roundList.first.nativeElement, 'color', `${color}`);
    if (this.lstyle == 6) this.render.setStyle(this.roundList.first.nativeElement, 'background-color', `${color}`);
  }

  subscribe(key) {
    window.setTimeout(() => {
      this.events.subscribe(this.device.deviceName + ':' + key, message => {
        if (message == "loaded") {
          if (this.device.data.hasOwnProperty(key)) {
            this.processData(this.device.data[key])
          }
          this.changeDetectorRef.detectChanges();
        }
      });
    }, 100);
  }

  processData(data) {
    if (typeof data.swi != "undefined")
      this.state = data.swi;

    //三种文本数据接受方法
    if (typeof data.tex != "undefined")
      this.t0 = data.tex;
    if (typeof data.tex1 != "undefined")
      this.t1 = data.tex1;

    if (typeof data.tex0 != "undefined")
      this.t0 = data.tex0;
    if (typeof data.tex1 != "undefined")
      this.t1 = data.tex1;

    if (typeof data.t0 != "undefined")
      this.t0 = data.t0;
    if (typeof data.t1 != "undefined")
      this.t1 = data.t1;

    if (typeof data.ico != "undefined")
      this.ico = data.ico;
    if (typeof data.col != "undefined")
      this.color = data.col;
    // }
  }

  unsubscribe(key) {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + key);
  }

}
