import { Component, OnInit, ViewChild } from '@angular/core';
import { MessageService } from './message.service';
import { Router } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';
import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';
import { API } from 'src/app/configs/api.config';
import { IonInfiniteScroll } from '@ionic/angular';

@Component({
  selector: 'app-message',
  templateUrl: './message.page.html',
  styleUrls: ['./message.page.scss'],
  providers: [InAppBrowser]
})
export class MessagePage implements OnInit {

  totle = 0;
  editMode = false;
  page = 1;

  @ViewChild(IonInfiniteScroll) infiniteScroll: IonInfiniteScroll;

  get messageList() {
    return this.messageService.list
  }

  constructor(
    private messageService: MessageService,
    private dataService: DataService,
    private iab: InAppBrowser,
    private router: Router
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.messageService.getMessage(this.page)
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  switchMode() {
    this.editMode = !this.editMode;
  }

  openMess(item) {

  }

  delMess(messItem) {
    this.messageService.delMessage(messItem)
  }

  enter(messItem) {
    if (this.editMode) return;
    if (messItem.url.indexOf('http') > -1) {
      this.iab.create(messItem.url, '_system', 'location=no,hidden=no');
    } else if (messItem.url.indexOf('/device') > -1) {
      this.router.navigateByUrl(messItem.url)
    } else if (messItem.url.indexOf('/share-manager') > -1) {
      this.router.navigateByUrl(messItem.url)
    }
  }

  getimgUrl(messItem) {
    if (messItem.type == 'user')
      return API.USER.AVATAR + '/' + messItem.icon
    return ''
  }

  trackByFn(index, item) {
    return item.id
  }

  loadData(event) {
    setTimeout(() => {
      console.log('Done');
      this.page++;
      this.messageService.getMessage(this.page)
      event.target.complete();

      // App logic to determine if all data is loaded
      // and disable the infinite scroll
      // if (data.length == 1000) {
      //   event.target.disabled = true;
      // }
    }, 500);
  }

  toggleInfiniteScroll() {
    this.infiniteScroll.disabled = !this.infiniteScroll.disabled;
  }

}
