import {
  Component,
  ViewChild,
  ElementRef,
  ChangeDetectorRef
} from '@angular/core';
import {
  IonicPage,
  ViewController,
  Events
} from 'ionic-angular';
import { SpeechProvider } from '../../providers/speech/speech';

@IonicPage()
@Component({
  selector: 'page-speech',
  templateUrl: 'speech.html',
})
export class SpeechPage {
  @ViewChild("speechAudio", { read: ElementRef }) speechAudio: ElementRef;

  speechContent: string;

  timer;

  constructor(
    public events: Events,
    public viewCtrl: ViewController,
    public speechProvider: SpeechProvider,
    public changeDetectorRef: ChangeDetectorRef
  ) {
  }

  ionViewDidLoad() {
    this.events.subscribe('speech', (message) => {
      if (message == 'Sent') {
        //成功控制设备
        if (this.speechContent == '打开设备') {
          this.play("DeviceOpened");
        } else if (this.speechContent == '关闭设备') {
          this.play("DeviceClosed");
        } else if (this.speechContent.indexOf('打开') != -1) {
          this.play("Opened");
        } else if (this.speechContent.indexOf('关闭') != -1) {
          this.play("Closed");
        } else {
          this.play("Get");
        }
        this.close();
      } else if (message == 'Wait') {
        if (this.speechContent.indexOf('打开') != -1) {
          this.play("Opening");
        } else if (this.speechContent.indexOf('关闭') != -1) {
          this.play("Closing");
        } else {
          this.play("Wait");
        }
      } else if (message == 'Done') {
        if (this.speechContent.indexOf('打开') != -1) {
          this.play("Opened2");
        } else if (this.speechContent.indexOf('关闭') != -1) {
          this.play("Closed2");
        } else {
          this.play("Done");
        }
        this.close();
      }
      else {
        this.play(message);
      }
    });
    //获取识别到的内容，并显示
    this.events.subscribe('speech:content', (content) => {
      this.speechContent = content;
      this.changeDetectorRef.detectChanges();
    });
    this.start();
  }

  ionViewWillUnload() {
    this.speechProvider.end();
    this.events.unsubscribe('speech');
    this.events.unsubscribe('speech:content');
  }

  start() {
    this.play("Begin");
    this.speechContent = "等待语音指令";
    this.showSpeechCmdList = false;
    this.speechProvider.end();
    window.setTimeout(() => {
      this.speechProvider.getSpeechCmd();
      this.speechProvider.start();
    }, 500);
  }

  close() {
    this.timer = window.setInterval(() => {
      if (this.speechAudio.nativeElement.ended) {
        window.clearInterval(this.timer)
        this.viewCtrl.dismiss();
      }
    }, 50);
  }

  play(action) {
    let audioName = this.audio[action][this.randomNum(0, this.audio[action].length - 1)];
    this.speechAudio.nativeElement.src = `assets/aac/Speech_${audioName}.aac`;
  }

  showSpeechCmdList = false;
  help() {
    this.speechProvider.end();
    this.showSpeechCmdList = true;
    this.changeDetectorRef.detectChanges();
    this.play("Help");
  }

  randomNum(Min, Max) {
    if (Max == 0)
      return 0;
    var Range = Max - Min;
    var Rand = Math.random();
    var num = Min + Math.round(Rand * Range);
    return num;
  }

  audio = {
    "Begin": ["Begin"],
    "End": ["End"],
    "CannotControl": ["CannotControl"],
    "ChoseDevice": ["ChoseDevice"],
    "Unsupport": ["Unsupport"],
    "Help": ["Help"],
    "DevMode": ["DevMode"],
    "Boot": ["Boot"],
    "NetError": ["NetError"],
    "Wait": ["Wait1", "Wait2", "Doing"],
    "Opening": ["Opening1", "Opening2"],
    "Opened": ["Opened1", "Opened2"],
    "Opened2": ["Opened2"],
    "Closing": ["Closing1", "Closing2"],
    "Closed": ["Closed1", "Closed2"],
    "Closed2": ["Closed2"],
    "DeviceOpened": ["DeviceOpened"],
    "DeviceClosed": ["DeviceClosed"],
    "Doing": ["Doing"],
    "Done": ["Done"],
    "Error": ["Error1", "Error2", "Error3"],
    "NotFound": ["NotFound1", "NotFound2"],
    "Get": ["Get1", "Get2", "Get3", "Get4"]
  }

}

