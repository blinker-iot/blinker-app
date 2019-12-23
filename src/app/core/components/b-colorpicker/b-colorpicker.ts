import {
  Component,
  ViewChild,
  ElementRef,
  Renderer2,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { Events } from '@ionic/angular';
import { HammerGestureConfig, HAMMER_GESTURE_CONFIG } from '@angular/platform-browser';
import * as Hammer from 'hammerjs';

export class MyHammerConfig extends HammerGestureConfig {
  overrides = <any>{
    'pan': { direction: Hammer.DIRECTION_ALL, threshold: 99 }
  }
}


@Component({
  selector: 'b-colorpicker',
  templateUrl: 'b-colorpicker.html',
  styleUrls: ['b-colorpicker.scss'],
  providers: [{
    provide: HAMMER_GESTURE_CONFIG,
    useClass: MyHammerConfig
  }]
})
export class BColorpickerComponent {

  @Output() colorChange = new EventEmitter();

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

  @Input() enableWhite = false;

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

  @ViewChild('picker', { read: ElementRef, static: true }) picker: ElementRef;
  @ViewChild('pickerbox', { read: ElementRef, static: true }) pickerbox: ElementRef;
  @ViewChild('knob', { read: ElementRef, static: true }) knob: ElementRef;

  value = 0;

  constructor(
    private renderer: Renderer2,
    public changeDetectorRef: ChangeDetectorRef,
    public events: Events,
  ) {
  }

  ngAfterViewInit() {
    this.loadColorImg();
    this.loaded = true;
  }

  ngOnDestroy() {
    // this.unsubscribe(this.key);
  }

  // subscribe(key) {
  //   window.setTimeout(() => {
  //     this.events.subscribe(this.device.deviceName + ':' + key, message => {
  //       if (message == "loaded") {
  //         if (this.device.data.hasOwnProperty(key)) {
  //           this.processData(this.device.data[key])
  //         }
  //         this.changeDetectorRef.detectChanges();
  //       }
  //     });
  //   }, 100);
  // }

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

  // unsubscribe(key) {
  //   if (typeof (this.device) != 'undefined')
  //     this.events.unsubscribe(this.device.deviceName + ':' + key);
  // }

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
    let z = r * 0.91 / Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
    let x1 = (x - centerX) * z + centerX - rect.left;
    let y1 = (y - centerY) * z + centerY - rect.top;
    // this.moveKnob(x1, y1);
    this.renderer.setStyle(this.knob.nativeElement, 'left', `${(x1 - 20).toString()}px`);
    this.renderer.setStyle(this.knob.nativeElement, 'top', `${(y1 - 20).toString()}px`);
    // return { x: x1, y: y1 };
    this.pick(x1, y1);
  }

  tapEvent(e) {
    this.getKnob(e);
    // this.sendData();
    this.sendDataAtEnd();
  }

  panstartEvent(e) {
    this.renderer.setStyle(this.knob.nativeElement, 'opacity', '1')
    this.getKnob(e);
  }

  panmoveEvent(e) {
    this.getKnob(e);
  }

  panendEvent(e) {
    // this.renderer.setStyle(this.knob.nativeElement, 'transition', '0')
    this.renderer.setStyle(this.knob.nativeElement, 'opacity', '0')
    this.getKnob(e);
    this.sendDataAtEnd();
  }

  // valueChange(value) {
  //   this.value = value;
  //   this.rgbStr = `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value / 255})`
  //   this.renderer.setStyle(this.picker.nativeElement, 'background-color', this.rgbStr);
  //   this.changeDetectorRef.detectChanges();
  // }

  context;
  image;
  @ViewChild("myCanvas",{ read: ElementRef, static: true }) myCanvas;
  length;
  loadColorImg() {
    this.context = this.myCanvas.nativeElement.getContext("2d");
    this.image = new Image();
    if (this.enableWhite) this.image.src = `assets/img/layouter/colorpicker.png`;
    else this.image.src = `assets/img/devices/ownlight/colorpicker.png`;
    this.image.onload = () => {
      window.setTimeout(() => {
        this.length = this.pickerbox.nativeElement.clientHeight;
        // console.log(this.length);
        this.renderer.setAttribute(this.myCanvas.nativeElement, 'width', `${this.length * 4}`);
        this.renderer.setAttribute(this.myCanvas.nativeElement, 'height', `${this.length * 4}`);
        this.renderer.setStyle(this.knob.nativeElement, 'top', `${this.length / 2 - 20}px`)
        this.renderer.setStyle(this.knob.nativeElement, 'left', `${this.length / 2 - 20}px`)
        this.context.drawImage(this.image, 0, 0, this.length * 4, this.length * 4);
      }, 50);
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
      // this.rgbStr = `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value / 255})`
      this.rgbStr = `rgb(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]})`
      this.renderer.setStyle(this.picker.nativeElement, 'background-color', this.rgbStr);
      this.changeDetectorRef.detectChanges();
      this.sendData();
    }
  }

  canSend = false;
  sendData() {
    if (this.canSend) {
      this.colorChange.emit(this.rgb);
      this.canSend = false;
      window.setTimeout(() => {
        this.canSend = true;
      }, 100);
    }
  }

  sendDataAtEnd() {
    // console.log(this.rgb);
    this.colorChange.emit(this.rgb);
  }

}
