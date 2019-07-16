import { UserProvider } from '../../providers/user/user';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import Cropper from 'cropperjs';

@IonicPage()
@Component({
  selector: 'page-useravatar',
  templateUrl: 'user-avatar.html'
})
export class UserAvatarPage {
  cropper: Cropper;
  @ViewChild('image') image: ElementRef;
  pictureURI;

  constructor(
    public navCtrl: NavController,
    public userProvider: UserProvider,
    public navParams: NavParams,
  ) {
    this.pictureURI = this.navParams.data;
  }

  ionViewDidLoad() {
    this.cropImage();
  }

  confirm() {
    let croppedImg = this.cropper.getCroppedCanvas({
      width: 300,
      height: 300
    }).toDataURL('image/jpeg');
    this.userProvider.uploadAvatar(croppedImg);
    this.navCtrl.pop();
  }

  cancel() {
    this.navCtrl.pop();
  }

  cropImage() {
    this.cropper = new Cropper(this.image.nativeElement, {
      // dragMode: 'move',//点击移动move画布crop生成新裁剪框
      dragMode: 'move',
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
      // responsive: true,//在窗口尺寸改变的时候重置cropper
      cropBoxMovable: false,//裁剪框不可以移动
      cropBoxResizable: false,//裁剪框不可以缩放
      checkOrientation: false,//获取图片旋转方向
      // scalable: true,//是否允许扩展图片
      crop: (e) => {
      }
    });
  }

  rotate() {
    this.cropper.rotate(90);
  }

}

