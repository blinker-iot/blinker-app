import { Component, Output, EventEmitter } from '@angular/core';
import { Mode } from '../layouter2-mode';
import { LayouterService } from '../../layouter.service';
import { ModalController } from '@ionic/angular';
import { NoticeService } from 'src/app/core/services/notice.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'layouter2-background',
  templateUrl: './background.component.html',
  styleUrls: ['./background.component.scss']
})
export class BackgroundComponent {

  bgList = [
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/99.jpg',
      url: ''
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/0.jpg',
      url: 'assets/img/headerbg.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/1.jpg',
      url: 'assets/img/bg/1.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/2.jpg',
      url: 'assets/img/bg/2.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/3.jpg',
      url: 'assets/img/bg/3.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/4.jpg',
      url: 'assets/img/bg/4.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/5.jpg',
      url: 'assets/img/bg/5.jpg'
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f1.jpg',
      url: 'assets/img/bg/f1.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f2.jpg',
      url: 'assets/img/bg/f2.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f3.jpg',
      url: 'assets/img/bg/f3.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f4.jpg',
      url: 'assets/img/bg/f4.jpg',
      isFull: true
    },
    {
      type: 'img',
      img: 'assets/img/bg/thumbnail/f5.jpg',
      url: 'assets/img/bg/f5.jpg',
      isFull: true
    }
  ]

  mode = 1;

  @Output() background = new EventEmitter();

  constructor(
    private LayouterService: LayouterService,
    private modalCtrl: ModalController,
    private notice: NoticeService,
    private dataService: DataService
  ) { }

  exit() {
    this.LayouterService.action.next({ name: 'changeMode', data: Mode.Edit })
    this.modalCtrl.dismiss();
  }

  selectedItem = 100;
  selected(item, index) {
    this.selectedItem = index;
    this.LayouterService.changeBackground({ img: item.url, isFull: item.isFull });
  }

  changeMode(i) {
    if (this.dataService.isAdvancedDeveloper)
      this.mode = i
    else
      this.notice.showToast('自定义背景图仅限专业版使用');
  }

  bgPosition = 1;
  headerStyle = 'dark';
  imgurl = "";

  selectBgPosition(i) {
    this.bgPosition = i
  }

  selectHeaderStyle(style) {
    this.headerStyle = style
  }

  saveCustom() {
    if ((this.imgurl.indexOf('https://') > -1 || this.imgurl.indexOf('http://') > -1) || (this.imgurl.indexOf('.png') > -1 || this.imgurl.indexOf('.jpg') > -1)) {
      this.LayouterService.changeBackground({ img: this.imgurl, isFull: this.bgPosition == 1, headerStyle: this.headerStyle });
      this.exit()
    }
    else
      this.notice.showToast('url格式不合法')
  }

}
