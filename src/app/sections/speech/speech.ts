import {
  Component,
  ChangeDetectorRef
} from '@angular/core';
import {
  NavController,
  ModalController,
} from '@ionic/angular';
import { SpeechService } from './speech.service';
import { randomNum } from 'src/app/core/functions/func';
import { AudioService } from 'src/app/core/services/audio.service';


@Component({
  selector: 'page-speech',
  templateUrl: 'speech.html',
  styleUrls: ['speech.scss']
})
export class SpeechPage {

  get speechTextList() {
    return this.speechService.speechTextList
  }

  speechContent = "等待语音指令";

  timer;
  timercnt;

  showSpeechCmdList;
  closeAnimate;

  contentSubject;
  actionSubject;

  constructor(
    private speechService: SpeechService,
    private navCtrl: NavController,
    private changeDetectorRef: ChangeDetectorRef,
    private modalCtrl: ModalController,
    private audio: AudioService
  ) {
  }

  ngOnInit(): void {
    this.showSpeechCmdList = false;
    this.closeAnimate = false;
  }

  ngAfterViewInit(): void {
    this.speechService.init();
    // this.contentSubject = this.speechService.action.subscribe(message => {
    //   if (message == 'Sent') {
    //     //成功控制设备
    //     if (this.speechContent == '打开设备') {
    //       this.play("DeviceOpened");
    //     } else if (this.speechContent == '关闭设备') {
    //       this.play("DeviceClosed");
    //     } else if (this.speechContent.indexOf('打开') != -1) {
    //       this.play("Opened");
    //     } else if (this.speechContent.indexOf('关闭') != -1) {
    //       this.play("Closed");
    //     } else {
    //       this.play("Get");
    //     }
    //     this.close();
    //   } else if (message == 'Wait') {
    //     if (this.speechContent.indexOf('打开') != -1) {
    //       this.play("Opening");
    //     } else if (this.speechContent.indexOf('关闭') != -1) {
    //       this.play("Closing");
    //     } else {
    //       this.play("Wait");
    //     }
    //   } else if (message == 'Done') {
    //     if (this.speechContent.indexOf('打开') != -1) {
    //       this.play("Opened2");
    //     } else if (this.speechContent.indexOf('关闭') != -1) {
    //       this.play("Closed2");
    //     } else {
    //       this.play("Done");
    //     }
    //     this.close();
    //   }
    //   else {
    //     this.play(message);
    //   }
    // });
    // //获取识别到的内容，并显示
    // this.actionSubject = this.speechService.content.subscribe((content: string) => {
    //   this.speechContent = content.replace('。', '');
    //   this.changeDetectorRef.detectChanges();
    // });
    // this.start();
  }

  ngOnDestroy(): void {
    // this.speechService.end();
    this.contentSubject.unsubscribe();
    this.actionSubject.unsubscribe();
  }

  start() {
    this.play("Begin");
    this.speechContent = "等待语音指令";
    this.showSpeechCmdList = false;
    this.speechService.end();
    window.setTimeout(() => {
      this.speechService.getSpeechCmd();
      this.speechService.start();
    }, 500);
  }

  close() {
    this.closeView();
  }

  async closeView() {
    if (typeof await this.modalCtrl.getTop() != 'undefined') {
      this.modalCtrl.dismiss()
    } else {
      this.closeAnimate = true;
      this.navCtrl.pop();
    }
  }

  play(action) {
    let audioName = this.speechService.audio[action][randomNum(0, this.speechService.audio[action].length - 1)];
    this.audio.play(audioName)
  }

  help() {
    this.speechService.end();
    this.showSpeechCmdList = true;
    this.changeDetectorRef.detectChanges();
    this.play("Help");
  }

}

