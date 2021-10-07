import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import * as Cropper from 'cropperjs/dist/cropper';
import { ModalController, ActionSheetController, Platform } from '@ionic/angular';
import { Camera, CameraOptions } from '@ionic-native/camera/ngx';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-avatar-picker',
  templateUrl: './avatar-picker.component.html',
  styleUrls: ['./avatar-picker.component.scss'],
  providers: [Camera]
})
export class AvatarPickerComponent implements OnInit {
  showCommitment = true;
  cropper: Cropper;
  avatar64;

  @ViewChild('image', { read: ElementRef, static: false }) image: ElementRef;

  actionSheet;

  constructor(
    private modal: ModalController,
    private userService: UserService,
    private actionSheetCtrl: ActionSheetController,
    private platform: Platform,
    private camera: Camera
  ) { }

  ngOnInit() {
    // if (this.router.url.indexOf('visitor') > -1)
    //   // this.isVisitor = true
  }

  ngAfterViewInit(): void {
    // this.showActionSheet()
  }

  close() {
    this.modal.dismiss()
  }

  //修改头像
  async showActionSheet() {
    this.actionSheet = await this.actionSheetCtrl.create({
      header: '修改头像',
      buttons: [
        { text: '手机拍照', handler: () => { this.getPicture(1); } },
        { text: '本地图片', handler: () => { this.getPicture(0); } }
      ]
    });
    await this.actionSheet.present();
  }

  tempImgFile;
  getPicture(sourceType) {
    if (this.platform.is('cordova')) {
      const options: CameraOptions = {
        quality: 50,
        sourceType: sourceType,
        destinationType: this.camera.DestinationType.DATA_URL,
        encodingType: this.camera.EncodingType.JPEG,
        mediaType: this.camera.MediaType.PICTURE
      }
      this.camera.getPicture(options).then((imageData) => {
        this.tempImgFile = 'data:image/jpeg;base64,' + imageData;
        // this.router.navigate(['/user/avatar'])
        this.cropImage()
      }, (err) => {
        console.log("获取图片失败");
      });
    }
    else {
      this.tempImgFile = 'assets/img/panda.jpg';
      this.cropImage()
    }
  }

  confirm() {
    let croppedImg = this.cropper.getCroppedCanvas({
      width: 300,
      height: 300
    });
    // 支持ios10
    if (!HTMLCanvasElement.prototype.toBlob) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        value: function (callback, type, quality) {

          var binStr = atob(this.toDataURL(type, quality).split(',')[1]),
            len = binStr.length,
            arr = new Uint8Array(len);
          for (var i = 0; i < len; i++) {
            arr[i] = binStr.charCodeAt(i);
          }
          callback(new Blob([arr], { type: type || 'image/png' }));
        }
      });
    }
    croppedImg.toBlob(blob => {
      this.userService.uploadAvatar(blob).then(result => {
        this.close()
      });
    }, 'image/jpeg', 0.6);
  }

  cropImage() {
    setTimeout(() => {
      if (typeof this.cropper != 'undefined') {
        this.cropper.destroy()
      }
      this.cropper = new Cropper(this.image.nativeElement, {
        dragMode: 'move',//点击移动move画布crop生成新裁剪框
        aspectRatio: 1,//裁剪框比例
        viewMode: 1,//图片显示模式
        modal: true,//是否在剪裁框上显示黑色的模态窗口
        guides: false,//是否在剪裁框上显示虚线
        highlight: true,//是否在剪裁框上显示白色的模态窗口
        center: false,//是否显示裁剪框 中间的+
        background: false,//是否在容器上显示网格背景
        autoCrop: true,//是否自动裁剪图片
        autoCropArea: 0.8,//自动裁剪图片比例
        movable: true,//图片可移动
        zoomable: true,//图片可以缩放
        //responsive: true,//在窗口尺寸改变的时候重置cropper
        cropBoxMovable: false,//裁剪框不可以移动
        cropBoxResizable: false,//裁剪框不可以缩放
        checkOrientation: true,//获取图片旋转方向
        rotatable: true,
        scalable: true
      });
    }, 500);

  }

  rotate() {
    this.cropper.rotate(90);
  }

  closeCommitment() {
    this.showCommitment = false;
  }

}
