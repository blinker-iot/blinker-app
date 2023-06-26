import { Component, Input, Renderer2, ViewChild, ElementRef, Injectable } from '@angular/core';
import { Layouter2Widget } from '../config';
import { LayouterService } from '../../../layouter.service';


@Component({
  selector: 'widget-joystick',
  templateUrl: 'widget-joystick.html',
  styleUrls: ['widget-joystick.scss']
})
export class WidgetJoystickComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
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
    private renderer: Renderer2,
    private LayouterService: LayouterService
  ) {
  }

  ngAfterContentInit() {
    // this.setStick();
  }

  ngOnDestroy() {

  }

  oldX;
  oldY;
  lastSendTime;
  panmove(event) {
    // console.log(event);
    
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
      this.sendData(senddata);
      this.oldX = x;
      this.oldY = y;
    }
  }

  panend(event) {
    this.renderer.setStyle(this.stick.nativeElement, 'left', `calc(50% - 35px)`);
    this.renderer.setStyle(this.stick.nativeElement, 'top', `calc(50% - 35px)`);
    let senddata = `{"${this.key}":[128,128]}\n`;
    this.LayouterService.send(senddata);
  }

  canSend = true;
  sendData(senddata) {
    if (this.canSend) {
      this.LayouterService.send(senddata);
      this.canSend = false;
      window.setTimeout(() => {
        this.canSend = true;
      }, 100);
    }
  }

}
