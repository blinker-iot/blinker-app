import { Component, Input, Renderer2, ViewChild, ElementRef } from '@angular/core';
import { Layout2Component } from '../layout.component';
import { Events, Gesture, ModalController } from 'ionic-angular';
declare var Hammer: any;

@Component({
  selector: 'layout2joystick',
  templateUrl: 'layout2joystick.html'
})
export class Layout2joystickComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {
    editMode: false,
    scaling: 1
  };
  // @Input() content = '自定义文本';
  @Input() key;
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
  gesture: Gesture;
  @ViewChild("touchZone", { read: ElementRef }) touchZone: ElementRef;
  @ViewChild("stick", { read: ElementRef }) stick: ElementRef;
  loaded = false;

  constructor(
    public events: Events,
    private renderer: Renderer2,
    public modalCtrl: ModalController
  ) {
  }

  ngAfterViewInit() {
    this.listenGesture();
    window.setTimeout(() => {
      this.setStick();
      this.loaded = true;
    }, 300);
  }

  ngOnDestroy() {
    this.gesture.destroy();
  }

  setStick() {
    let _touchZone = this.touchZone.nativeElement.getBoundingClientRect();
    let _stick = this.stick.nativeElement.getBoundingClientRect();
    let l = (_touchZone.width - _stick.width) / 2;
    let t = (_touchZone.height - _stick.height) / 2;
    if (this.layouter.editMode) {
      l = l / this.layouter.scaling;
      t = t / this.layouter.scaling;
    }
    this.renderer.setStyle(this.stick.nativeElement, 'left', `${(l).toString()}px`);
    this.renderer.setStyle(this.stick.nativeElement, 'top', `${(t).toString()}px`);
  }

  listenGesture() {
    this.gesture = new Gesture(this.touchZone.nativeElement, {
      recognizers: [
        [Hammer.Pan, { threshold: 1, direction: Hammer.DIRECTION_ALL }]
      ]
    });
    this.gesture.listen();
    this.gesture.on('panmove', e => this.panmoveEvent(e));
    this.gesture.on('panend', e => this.panendEvent(e));
    console.log('listenGesture');
  }

  unlistenGesture() {
    this.gesture.unlisten();
  }

  tap() {
    if (this.layouter.editMode) {
      let modal = this.modalCtrl.create('Layout2ComponentSettingsPage', this);
      modal.present();
    }
  }

  oldX;
  oldY;
  panmoveEvent(event) {
    //console.log('panmoveEvent');
    if (!this.layouter.editMode) {
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
        this.events.publish('layout:send', senddata);
        this.oldX = x;
        this.oldY = y;
      }
    }
  }

  panendEvent(event) {
    if (!this.layouter.editMode) {
      this.setStick();
      let senddata = `{"${this.key}":[128,128]}\n`;
      this.events.publish('layout:send', senddata);
    }
  }

}
