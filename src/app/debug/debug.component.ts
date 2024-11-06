import { Component, Input, ViewChild, ElementRef, ChangeDetectorRef, Renderer2 } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DebugService } from './debug.service';
import { DeviceService } from '../core/services/device.service';
import { NativeService } from '../core/services/native.service';

@Component({
  selector: 'app-debug',
  templateUrl: './debug.component.html',
  styleUrls: ['./debug.component.scss'],
})
export class DebugComponent {

  @Input() device;
  @Input() mode;

  sendmess = '';
  listenKeyboardShow;
  listenKeyboardHide;
  boxHeight = '';

  oldDataLength = 0;
  debugServiceSubject;
  get data() {
    return this.debugService.dataList[this.device.deviceName]
  }

  get switch() {
    if (typeof this.device == 'undefined')
      return
    if (this.device.data.switch == 'on')
      return true
    else
      return false
  }

  @ViewChild("scrollContainer", { read: ElementRef, static: true }) scrollContainer: ElementRef;
  @ViewChild('box', { read: ElementRef, static: true }) box: ElementRef;
  @ViewChild('myInput', { read: ElementRef, static: true }) myInput: ElementRef;

  constructor(
    public changeDetectorRef: ChangeDetectorRef,
    public renderer: Renderer2,
    public modalCtrl: ModalController,
    private debugService: DebugService,
    private deviceService: DeviceService,
    private nativeService:NativeService
  ) { }

  ngAfterViewInit() {
    this.listenKeyboard();
    this.debugServiceSubject = this.debugService.state.subscribe(() => {
      setTimeout(() => {
        this.scrollToBottom();
      }, 10);
    })
    setTimeout(() => {
      this.myInput.nativeElement.focus();
    }, 300);
  }

  ngOnDestroy() {
    this.debugServiceSubject.unsubscribe();
    this.unlistenKeyboard();
  }

  scrollToBottom() {
    this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
  }

  clear() {
    this.debugService.clean(this.device)
  }

  close() {
    this.modalCtrl.dismiss();
  }

  send() {
    this.deviceService.sendData(this.device, this.sendmess);
    this.sendmess = '';
    this.scrollToBottom();
  }

  tapSwitch() {
    if (this.device.config.mode != "mqtt") return;
    let message;
    if (this.device.data.switch == "on") {
      message = `{"switch":"off"}`;
    } else {
      message = `{"switch":"on"}`;
    }
    this.deviceService.pubMessage(this.device, message);
  }

  sync() {
    this.sendmess = `{"get":"state"}`;
    this.send()
  }

  listenKeyboard() {
    this.listenKeyboardShow = this.renderer.listen('window', 'native.keyboardshow', e => {
      this.boxHeight = `calc( 100vh - ${e.keyboardHeight + 70}px )`;
    });
    this.listenKeyboardHide = this.renderer.listen('window', 'native.keyboardhide', e => {
    });
  }

  unlistenKeyboard() {
    if (typeof (this.listenKeyboardShow) === 'function') this.listenKeyboardShow();
    if (typeof (this.listenKeyboardHide) === 'function') this.listenKeyboardHide();
  }


}
