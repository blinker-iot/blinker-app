import { Component, Input, ElementRef, ViewChild, Renderer2, ViewChildren, QueryList } from '@angular/core';
import { Events } from '@ionic/angular';
import { Layouter2Widget } from '../config';
import { HammerGestureConfig, HAMMER_GESTURE_CONFIG } from '@angular/platform-browser';
import { NativeService } from 'src/app/core/services/native.service';

export class MyHammerConfig extends HammerGestureConfig {
  overrides = <any>{
    'press': { time: 300, threshold: 99 } // override default settings
  }
}

@Component({
  selector: 'widget-button',
  templateUrl: 'widget-button.html',
  styleUrls: ['widget-button.scss'],
  providers: [{
    provide: HAMMER_GESTURE_CONFIG,
    useClass: MyHammerConfig
  }]
})
export class WidgetButtonComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue(['tex', 't0', 'text'])
  }

  get ico() {
    return this.getValue(['ico', 'icon'])
  }

  get color() {
    return this.getValue(['clr', 'col', 'color'])
  }

  get state() {
    return this.getValue(['swi', 'switch'])
  }

  get mode() {
    return this.getValue(['mode'])
  }

  get custom() {
    return this.getValue(['cus', 'custom'])
  }

  getValue(valueKeys: string[]): any {
    for (let valueKey of valueKeys) {
      if (typeof this.device.data[this.key] != 'undefined')
        if (typeof this.device.data[this.key][valueKey] != 'undefined')
          return this.device.data[this.key][valueKey]
      if (typeof this.widget[valueKey] != 'undefined')
        return this.widget[valueKey]
    };
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

  pressed = false;

  @ViewChild("button", { read: ElementRef, static: true }) button: ElementRef;

  constructor(
    public events: Events,
    public render: Renderer2,
    private nativeService: NativeService
    // private changeDetectorRef: ChangeDetectorRef
  ) { }

  ngAfterViewInit() {
    this.listenGesture();
  }

  ngOnDestroy() {
    this.unlistenGesture();
  }

  mouseupEvent;
  touchendEvent;
  listenGesture() {
    // 修复手指移动后无法触发pressup的问题
    this.mouseupEvent = this.render.listen(this.button.nativeElement, 'mouseup', e => this.pressup(e));
    this.touchendEvent = this.render.listen(this.button.nativeElement, 'touchend', e => this.pressup(e));
  }

  unlistenGesture() {
    this.mouseupEvent();
    this.touchendEvent();
  }

  press(event) {
    this.pressed = true;
    let data = `{"${this.key}":"press"}\n`;
    this.events.publish('layouter2', 'send', data + '\n');
    // console.log(data);
  }

  pressup(event) {
    if (this.pressed) {
      this.pressed = false;
      let data = `{"${this.key}":"pressup"}\n`;
      this.events.publish('layouter2', 'send', data + '\n');
    }
  }

  tap(event) {
    let data;
    if (this.mode == 0) {
      data = `{"${this.key}":"tap"}`;
    } else if (this.mode == 1) {
      data = (this.state == 'on') ? `{"${this.key}":"off"}` : `{"${this.key}":"on"}`;
    } else if (this.mode == 2) {
      data = `{"${this.key}":"${this.custom}"}`;
    }
    this.events.publish('layouter2', 'send', data + '\n');
    this.nativeService.vibrate();
  }

}
