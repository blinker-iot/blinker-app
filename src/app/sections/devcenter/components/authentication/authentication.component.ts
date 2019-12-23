import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { Camera, CameraOptions } from '@ionic-native/camera/ngx';
import { Platform, ActionSheetController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { DevcenterService } from '../../devcenter.service';
import { DataService } from 'src/app/core/services/data.service';
// import { NoticeService } from 'src/app/core/services/notice.service';

function base64ToBlob(base64) {
  var base64Arr = base64.split(',');
  var imgtype = '';
  var base64String = '';
  if (base64Arr.length > 1) {
    //如果是图片base64，去掉头信息
    base64String = base64Arr[1];
    imgtype = base64Arr[0].substring(base64Arr[0].indexOf(':') + 1, base64Arr[0].indexOf(';'));
  }
  // 将base64解码
  var bytes = atob(base64String);
  //var bytes = base64;
  var bytesCode = new ArrayBuffer(bytes.length);
  // 转换为类型化数组
  var byteArray = new Uint8Array(bytesCode);

  // 将base64转换为ascii码
  for (var i = 0; i < bytes.length; i++) {
    byteArray[i] = bytes.charCodeAt(i);
  }

  // 生成Blob对象（文件对象）
  return new Blob([bytesCode], { type: imgtype });
};

@Component({
  selector: 'dev-authentication',
  templateUrl: './authentication.component.html',
  styleUrls: ['./authentication.component.scss'],
  providers: [Camera]
})
export class AuthenticationComponent implements OnInit {

  type = "individual";
  vender = "";
  img0;
  img1;

  @Output() confirm = new EventEmitter();

  constructor(
    private camera: Camera,
    private platform: Platform,
    private userService: UserService,
    private dataService: DataService,
    private devcenterService: DevcenterService,
    private actionSheetCtrl: ActionSheetController,
    // private noticeService: NoticeService
  ) { }

  ngOnInit() {
    this.vender = this.dataService.user.username;
  }

  upload() {
    if (typeof this.img0 == 'undefined') return;
    let authInfo = {
      type: this.type,
      vender: this.vender,
      idCard: base64ToBlob(this.img0)
    }
    if (this.type == 'enterprise') {
      if (typeof this.img1 == 'undefined') return;
      authInfo['charter'] = base64ToBlob(this.img1);
    }
    // this.noticeService.showLoading('upload');
    this.devcenterService.uploadAuthInfo(authInfo).then(result => {
      if (result)
        this.confirm.emit(result);
    });
  }

  changeType() {
    console.log(this.type);
  }

  async getPictureActionSheet(imgNum) {
    let actionSheet = await this.actionSheetCtrl.create({
      header: '获取证件方式',
      buttons: [
        { text: '手机拍照', handler: () => { this.getPicture(1, imgNum); } },
        { text: '本地图片', handler: () => { this.getPicture(0, imgNum); } }
      ]
    });
    actionSheet.present();
  }

  getPicture(sourceType, imgNum) {
    if (this.platform.is('cordova')) {
      const options: CameraOptions = {
        quality: 50,
        sourceType: sourceType,
        destinationType: this.camera.DestinationType.DATA_URL,
        encodingType: this.camera.EncodingType.JPEG,
        mediaType: this.camera.MediaType.PICTURE
      }
      this.camera.getPicture(options).then((imageData) => {
        if (imgNum == 0)
          this.img0 = 'data:image/jpeg;base64,' + imageData;
        else
          this.img1 = 'data:image/jpeg;base64,' + imageData;
      }, (err) => {
        console.log("获取图片失败");
      });
    }
    else {
      console.log("当前功能只支持真机使用");
    }
  }

}
