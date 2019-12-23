import { Component, OnInit, Input } from '@angular/core';
import { MessageItem, MessageType } from '../message.model';
import { HammerGestureConfig, HAMMER_GESTURE_CONFIG } from '@angular/platform-browser';
import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';
import { Router } from '@angular/router';
import { MessageService } from '../message.service';

export class MyHammerConfig extends HammerGestureConfig {
  overrides = <any>{
    'press': { time: 555, threshold: 99 } // override default settings
  }
}

@Component({
  selector: 'mess-item',
  templateUrl: './mess-item.component.html',
  styleUrls: ['./mess-item.component.scss'],
  providers: [
    InAppBrowser,
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: MyHammerConfig
    }]
})
export class MessItemComponent implements OnInit {

  @Input() message: MessageItem;
  @Input() editMode = false;

  constructor(
    private iab: InAppBrowser,
    private router: Router,
    private messageService: MessageService
  ) { }

  ngOnInit() { }

  goto() {
    if (this.editMode) return;
    if (this.message.url.indexOf('http') > -1) {
      this.iab.create(this.message.url, '_system', 'location=no,hidden=no');
    } else if (this.message.url.indexOf('/device') > -1) {
      this.router.navigateByUrl(this.message.url)
    } else if (this.message.url.indexOf('/share-manager') > -1) {
      this.router.navigateByUrl(this.message.url)
    }
  }

  //提示是否要删除该消息
  showDelAlert() {
    console.log('del');
    this.delMessage();
  }

  delMessage() {
    this.messageService.delMessage(this.message)
  }

  //提示：该消息由设备提供商发布，是否前往查看？  
  showUrlAlert() {
    console.log('show');
  }
}
