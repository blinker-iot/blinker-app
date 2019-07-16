import { Component, Input, ViewChild, ElementRef, ChangeDetectorRef, Renderer2 } from '@angular/core';
import { Layout2Component } from '../layout.component';
import { Events, ModalController } from 'ionic-angular';
import { isNumber, isJson } from '../../functions/func';

@Component({
  selector: 'layout2debug',
  templateUrl: 'layout2debug.html'
})
export class Layout2debugComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {
    editMode: true
  };
  @Input() lstyle = 0;
  @Input() key;
  showInput = false;
  data = ``;

  @ViewChild("scrollContainer", { read: ElementRef }) scrollContainer: ElementRef;

  constructor(
    public events: Events,
    public modalCtrl: ModalController,
    public changeDetectorRef: ChangeDetectorRef,
  ) { }

  ngAfterViewInit() {
    if (typeof this.device != 'undefined')
      this.events.subscribe(this.device.deviceName + ':unknownData', message => {
        // console.log('layout2debug:');
        // console.log(message);
        this.data = this.data + message;
        if (this.data.length > 2048) {
          this.data = this.data.substr(100);
        }
        this.changeDetectorRef.detectChanges();
        this.scrollToBottom();
      });
  }

  ngOnDestroy() {
    if (typeof this.device != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':unknownData');
  }

  scrollToBottom() {
    this.scrollContainer.nativeElement.children[0].scrollTop = this.scrollContainer.nativeElement.children[0].scrollHeight;
  }

  clear() {
    if (!this.layouter.editMode){
      this.data = '';
      navigator.vibrate(10);
    }
  }

  sendmess;
  send() {
    if (!this.layouter.editMode) {
      // if (!isNumber(this.sendmess) && !isJson(this.sendmess)) {
      //   this.sendmess = `"${this.sendmess}"`;
      // }
      // if (isJson(this.sendmess)) {
      //   console.log('isJson')
      //   this.sendmess = JSON.stringify(JSON.parse(this.sendmess));
      // }
      // else if(!isNumber(this.sendmess)){
      //   this.sendmess=`"${this.sendmess}"`
      // }
      // console.log(this.sendmess)
      this.events.publish('layout:send', this.sendmess);
      this.sendmess = '';
      navigator.vibrate(10);
    }
  }

  showInputBox() {
    if (!this.layouter.editMode) {
      this.showInput = !this.showInput;
      window.setTimeout(() => {
        this.scrollToBottom();
      }, 100);
    }
  }

}
