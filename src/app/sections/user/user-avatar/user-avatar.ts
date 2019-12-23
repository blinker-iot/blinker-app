import { UserService } from 'src/app/core/services/user.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { NavController } from '@ionic/angular';
import * as Cropper from 'cropperjs/dist/cropper'
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'user-avatar',
  templateUrl: 'user-avatar.html',
  styleUrls: ['user-avatar.scss']
})
export class UserAvatarPage {
  cropper: Cropper;
  @ViewChild('image',{ read: ElementRef, static: false }) image: ElementRef;


  get tempImgFile() {
    return this.dataService.tempImgFile
  }

  constructor(
    public navCtrl: NavController,
    public userService: UserService,
    private dataService: DataService
  ) {
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.cropImage();
    }, 300);
  }

  confirm() {
    let croppedImg = this.cropper.getCroppedCanvas({
      width: 300,
      height: 300
    });

    croppedImg.toBlob(blob => {
      this.userService.uploadAvatar(blob).then(result => {
        if (result) {
          this.dataService.user.avatar = croppedImg.toDataURL('image/jpeg')
        }
      });
      this.navCtrl.pop();
    }, 'image/jpeg', 0.5);

  }

  cancel() {
    this.navCtrl.pop();
  }

  cropImage() {
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
      checkOrientation: false,//获取图片旋转方向
      //rotatable: true,
      //scalable: false,
    });
  }

  rotate() {
    this.cropper.rotate(90);
  }

}

