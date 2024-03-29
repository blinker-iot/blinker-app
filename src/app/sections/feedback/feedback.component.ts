import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import { FeedbackService } from './feedback.service';
import { DataService } from 'src/app/core/services/data.service';

enum FeedbackType {
  "设备使用" = 0,
  "用户账户" = 1,
  "其他问题" = 2,
}

@Component({
  selector: 'blinker-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
})
export class FeedbackPage implements OnInit {

  get isDeveloper() {
    return this.dataService.isDeveloper
  }

  selectType;
  content;
  isDone = false;

  constructor(
    private navCtrl: NavController,
    private feedbackService: FeedbackService,
    private dataService: DataService
  ) { }

  ngOnInit() {

  }

  select(type) {
    this.selectType = FeedbackType[type];
  }

  submit() {
    this.feedbackService.newFeedback({
      "recordType": this.selectType,
      "deviceType": "",
      "content": this.content,
    }).then(result => {
      this.isDone = true;
    })
  }

  back() {
    this.navCtrl.back();
  }

}
