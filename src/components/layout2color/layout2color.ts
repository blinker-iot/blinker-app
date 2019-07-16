import { Component, Input, ViewChild, ElementRef, Renderer2, ChangeDetectorRef } from '@angular/core';
import { Layout2Component } from '../layout.component';
import { Events, Gesture } from 'ionic-angular';
declare var Hammer: any;

@Component({
  selector: 'layout2color',
  templateUrl: 'layout2color.html'
})
export class Layout2colorComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {
    editMode: true
  };
  @Input() t0;
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
  _disabled = false;
  @Input()
  set disabled(disabled) {
    if (typeof this.gesture != 'undefined') {
      if (disabled) {
        this.unlistenGesture();
      } else {
        this.listenGesture();
      }
    }
    this._disabled = disabled;
  }
  get disabled() {
    return this._disabled;
  }

  // @Input() lstyle = 0;
  _lstyle = 0;
  @Input()
  set lstyle(lstyle) {
    if (this.loaded)
      this.loadColorImg();
    this._lstyle = lstyle;
  }
  get lstyle() {
    return this._lstyle
  }

  _color;
  @Input()
  set color(color) {
    this.renderer.setStyle(this.picker.nativeElement, 'background-color', color);
    this.rgbStr = color;
    this._color = color;
  }
  get color() {
    return this._color;
  }
  brightness;

  gesture;
  loaded = false;

  @ViewChild('picker', { read: ElementRef }) picker: ElementRef;
  @ViewChild('pickerbox', { read: ElementRef }) pickerbox: ElementRef;
  @ViewChild('knob', { read: ElementRef }) knob: ElementRef;

  value = 0;

  constructor(
    private renderer: Renderer2,
    public changeDetectorRef: ChangeDetectorRef,
    public events: Events,
  ) {
  }

  ngAfterViewInit() {
    this.listenGesture();
    this.loadColorImg();
    this.loaded = true;
  }

  ngOnDestroy() {
    this.unlistenGesture();
    this.unsubscribe(this.key);
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
    if (typeof data != "undefined") {
      if (data instanceof Array) {
        if (data.length < 3) return;
        let col = data.length == 3 ? 'rgb(' : 'rgba(';
        for (var i = 0; i < 3; i++) {
          col = col + `${data[i].toString()},`
        }
        if (data.length == 3) {
          col = col.substr(0, col.length) + ")";
        } else {
          col = col + `${(data[3] / 255).toString()})`;
          this.brightness = data[3];
          this.value = data[3];
        }
        console.log("获得颜色：" + col);
        this.color = col;
      }
    }
  }

  unsubscribe(key) {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + key);
  }

  listenGesture() {
    this.gesture = new Gesture(this.pickerbox.nativeElement, {
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

  // moveKnob(x, y) {
  //   this.renderer.setStyle(this.knob.nativeElement, 'left', `${(x - 10).toString()}px`);
  //   this.renderer.setStyle(this.knob.nativeElement, 'top', `${(y - 10).toString()}px`);
  // }

  // pickerRect;
  getKnob(e) {
    let rect = this.pickerbox.nativeElement.getBoundingClientRect();
    let r = (rect.right - rect.left) / 2;
    let centerX = rect.left + r;
    let centerY = rect.top + r;

    let x = e.center.x;
    let y = e.center.y;
    let z = r * 0.839 / Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
    let x1 = (x - centerX) * z + centerX - rect.left;
    let y1 = (y - centerY) * z + centerY - rect.top;
    // this.moveKnob(x1, y1);
    this.renderer.setStyle(this.knob.nativeElement, 'left', `${(x1 - 10).toString()}px`);
    this.renderer.setStyle(this.knob.nativeElement, 'top', `${(y1 - 10).toString()}px`);
    // return { x: x1, y: y1 };
    this.pick(x1, y1);
  }

  tapEvent(e) {
    if (this.disabled) return;
    this.getKnob(e);
    this.sendData();
  }

  panstartEvent(e) {
    if (this.disabled) return;
    this.getKnob(e);
  }

  panmoveEvent(e) {
    if (this.disabled) return;
    this.getKnob(e);
  }

  panendEvent(e) {
    if (this.disabled) return;
    this.getKnob(e);
    this.sendData();
  }

  valueChange(value) {
    this.value = value;
    this.rgbStr = `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value / 255})`
    this.renderer.setStyle(this.picker.nativeElement, 'background-color', this.rgbStr);
    this.changeDetectorRef.detectChanges();
  }

  context;
  image;
  @ViewChild("myCanvas") myCanvas;
  length;
  loadColorImg() {
    this.context = this.myCanvas.nativeElement.getContext("2d");
    this.image = new Image();
    this.image.src = `assets/img/layout/colorpick.png`;
    this.image.onload = () => {
      window.setTimeout(() => {
        this.length = this.pickerbox.nativeElement.clientHeight;
        // console.log(this.length);
        this.renderer.setAttribute(this.myCanvas.nativeElement, 'width', `${this.length * 4}`);
        this.renderer.setAttribute(this.myCanvas.nativeElement, 'height', `${this.length * 4}`);
        this.renderer.setStyle(this.knob.nativeElement, 'top', `${this.length / 2 - 10}px`)
        this.renderer.setStyle(this.knob.nativeElement, 'left', `${this.length / 2 - 10}px`)
        this.context.drawImage(this.image, 0, 0, this.length * 4, this.length * 4);
      }, 200);
      // this.context.drawImage(this.image, 0, 0, length, length);
    }
  }

  lastSendColor = '';
  rgb = [255, 255, 255];
  rgbStr = '#e6e6e6';
  pick(x, y) {
    let temp = this.context.getImageData(x * 4, y * 4, 1, 1).data;
    this.rgb = [temp[0], temp[1], temp[2]];
    let rgbString = this.rgb.toString();
    if (rgbString != this.lastSendColor) {
      this.lastSendColor = rgbString;
      this.rgbStr = `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value / 255})`
      this.renderer.setStyle(this.picker.nativeElement, 'background-color', this.rgbStr);
      this.changeDetectorRef.detectChanges();
      // this.sendData();
    }
  }

  sendData(e = '') {
    let data = `{"${this.key}":[${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value}]}\n`;
    this.events.publish('layout:send', data);
  }

}
