import { Component, Input, Renderer2, ViewChild, ElementRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { Events } from '@ionic/angular';
// import Hammer from 'hammerjs';

@Component({
  selector: 'widget-joystick',
  templateUrl: 'widget-joystick.html',
  styleUrls: ['widget-joystick.scss']
})
export class WidgetJoystickComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;
  // @Input() content = '自定义文本';
  @Input() key;

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return ''
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

  gesture;
  @ViewChild("touchZone", { read: ElementRef, static: true }) touchZone: ElementRef;
  @ViewChild("stick", { read: ElementRef, static: true }) stick: ElementRef;
  loaded = false;

  constructor(
    public events: Events,
    private renderer: Renderer2,
  ) {
  }

  ngAfterContentInit() {
    this.listenGesture();
    window.setTimeout(() => {
      this.setStick();
      this.loaded = true;
    }, 300);
  }

  ngOnDestroy() {
    // this.gesture.destroy();
  }

  setStick() {
    let _touchZone = this.touchZone.nativeElement.getBoundingClientRect();
    let _stick = this.stick.nativeElement.getBoundingClientRect();
    let l = (_touchZone.width - _stick.width) / 2;
    let t = (_touchZone.height - _stick.height) / 2;
    // if (this.layouter.editMode) {
      // l = l / this.layouter.scaling;
      // t = t / this.layouter.scaling;
    // }
    this.renderer.setStyle(this.stick.nativeElement, 'left', `${(l).toString()}px`);
    this.renderer.setStyle(this.stick.nativeElement, 'top', `${(t).toString()}px`);
  }

  listenGesture() {
    // this.gesture = new Hammer.Manager(this.touchZone.nativeElement, {
    //   recognizers: [
    //     [Hammer.Pan, { threshold: 1, direction: Hammer.DIRECTION_ALL }]
    //   ]
    // });
    // this.gesture.listen();
    // this.gesture.on('panmove', e => this.panmoveEvent(e));
    // this.gesture.on('panend', e => this.panendEvent(e));
  }

  unlistenGesture() {
    // this.gesture.unlisten();
  }

  oldX;
  oldY;
  lastSendTime;
  panmoveEvent(event) {
    //console.log('panmoveEvent');
    // if (!this.layouter.editMode) {
    let _touchZone = this.touchZone.nativeElement.getBoundingClientRect();
    let _stick = this.stick.nativeElement.getBoundingClientRect();
    let r = (_touchZone.width - _stick.width) / 2;
    let x = event.deltaX;
    let y = event.deltaY;
    let resize = r / Math.sqrt((x * x + y * y));
    if (resize > 1) resize = 1;
    let l = r + resize * x;
    let t = r + resize * y;
    x = Math.round((l / r) * 127.5);
    y = Math.round((t / r) * 127.5);
    if (this.oldX != x || this.oldY != y) {
      this.renderer.setStyle(this.stick.nativeElement, 'left', `${(l).toString()}px`);
      this.renderer.setStyle(this.stick.nativeElement, 'top', `${(t).toString()}px`);
      let senddata = `{"${this.key}":[${x},${y}]}\n`;
      // this.events.publish('layout:send', senddata);
      this.sendData(senddata);
      this.oldX = x;
      this.oldY = y;
    }
    // }
  }

  panendEvent(event) {
    // if (!this.layouter.editMode) {
      this.setStick();
      let senddata = `{"${this.key}":[128,128]}\n`;
      this.events.publish('layout:send', senddata);
    // }
  }

  canSend = true;
  sendData(senddata) {
    if (this.canSend) {
      this.events.publish('layout:send', senddata);
      this.canSend = false;
      window.setTimeout(() => {
        this.canSend = true;
      }, 100);
    }
  }

}
