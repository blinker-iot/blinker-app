import { Component, Input, ChangeDetectorRef, ViewChildren, ElementRef, QueryList, Renderer2 } from '@angular/core';
import { Layout2Component } from '../layout.component';
import { Events } from 'ionic-angular';

@Component({
  selector: 'layout2number',
  templateUrl: 'layout2number.html'
})
export class Layout2numberComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {};
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

  _value = 0;
  @Input()
  set value(value) {
    this._value = value;
    // this.changeDetectorRef.detectChanges();
  };
  get value() {
    return this._value;
  };

  @Input() unit = "";
  @Input() ico = "fal fa-question";
  @Input() lstyle = 0;
  _color = '#959595';
  @Input()
  set color(color) {
    this._color = color;
    window.setTimeout(() => {
      this.changeColor(this.color);
    }, 100);
  }
  get color() {
    return this._color
  }

  gaugeType = "arch";
  thick = 10;
  size = 110;
  // @Input()
  // get gaugeColor() {
  //   return this.toRgba(this._color)
  // }

  maxTimer;
  showGauge = true;
  _max = 100;
  @Input()
  set max(max) {
    if (max == null) return;
    //max改变后，刷新Gauge
    if (this.lstyle == 6) {
      window.clearTimeout(this.maxTimer)
      this.maxTimer = window.setTimeout(() => {
        this.showGauge = false;
        window.setTimeout(() => {
          this.showGauge = true;
          window.setTimeout(() => {
            this.changeColor(this.color);
          }, 50);
        }, 50);
      }, 1000);
    }
    this._max = max;
  }
  get max() {
    return this._max
  }

  _length = 50;
  @Input()
  set length(length) {
    if (this.lstyle == 6) {
      this.size = Math.round(length * 2 - 5);
      // console.log(" input length");
      // console.log(length);
      // console.log(this.size);
    }
    this._length = length
  }
  get length() {
    return this._length
  }
  // gaugeStyle = `{
  //   .gauge>.value {
  //       stroke: rgb(179, 243, 253);
  //       stroke-width: 6;
  //       fill: rgba(0, 0, 0, 0);
  //   }
  // }`
  // valueDialClass = "stroke: rgb(179, 243, 253);stroke-width:6;fill: rgba(0, 0, 0, 0);"

  @ViewChildren('icon') iconList: QueryList<ElementRef>;
  @ViewChildren('gauge') gaugeList: QueryList<ElementRef>;

  constructor(
    public events: Events,
    private changeDetectorRef: ChangeDetectorRef,
    public render: Renderer2,
  ) { }

  ngAfterViewInit() {
    if (typeof (this.device) != 'undefined') {
      window.setTimeout(() => {
        this.subscribe(this.key);
      }, 100);
    }
  }

  ngOnDestroy() {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + this.key);
  }

  subscribe(key) {
    if (typeof (this.device) != 'undefined')
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

  changeColor(color = '#959595') {
    if (color[0] != '#' && color[0] != 'r') color = '#' + color;
    if (typeof this.iconList != "undefined")
      if (typeof this.iconList.first != "undefined") {
        this.render.setStyle(this.iconList.first.nativeElement, 'color', `${color}`);
      }
    if (typeof this.gaugeList != "undefined")
      if (typeof this.gaugeList.first != "undefined") {
        let pathList = this.gaugeList.first.nativeElement.querySelectorAll('path');
        if (typeof pathList[1] != 'undefined')
          this.render.setStyle(pathList[1], 'stroke', `${color}`);
      }
  }

  processData(data) {
    if (typeof data.val != "undefined")
      this.value = data.val;
    if (typeof data.ico != "undefined")
      this.ico = data.ico;
    if (typeof data.tex != "undefined")
      this.t0 = data.tex;
    if (typeof data.t0 != "undefined")
      this.t0 = data.t0;
    if (typeof data.uni != "undefined")
      this.unit = data.uni;
    if (typeof data.col != "undefined")
      this.color = data.col;
  }

  unsubscribe(key) {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + key);
  }

  toRgba(hexColor: string) {
    if (hexColor[0] != '#' && hexColor[0] != 'r') hexColor = '#' + hexColor;
    let reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/;
    let sColor = hexColor.toLowerCase();
    if (sColor && reg.test(sColor)) {
      if (sColor.length === 4) {
        let sColorNew = "#";
        for (let i = 1; i < 4; i += 1) {
          sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1));
        }
        sColor = sColorNew;
      }
      //处理六位的颜色值
      var sColorChange = [];
      for (var i = 1; i < 7; i += 2) {
        sColorChange.push(parseInt("0x" + sColor.slice(i, i + 2)));
      }
      return "rgba(" + sColorChange.join(",") + ",1)";
    } else {
      return sColor;
    }
  };

}
