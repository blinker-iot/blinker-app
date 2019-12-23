import { Component, OnInit } from '@angular/core';
import {
  Events,
  ActionSheetController,
  AlertController,
  ModalController,
  NavController,
  Platform
} from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { Camera, CameraOptions } from '@ionic-native/camera/ngx';
// import { DeviceService } from 'src/app/core/services/device.service';
import { Router } from '@angular/router';
import { DataService } from 'src/app/core/services/data.service';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss'],
  providers: [Camera]
})
export class UserPage {
  alert;
  actionSheet;

  get user() {
    return this.dataService.user
  }

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private camera: Camera,
    public actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    public modalCtrl: ModalController,
    public events: Events,
    private router: Router,
    private navCtrl: NavController,
    private platform: Platform,
    private dataService: DataService
  ) { }

  ngOnDestroy(): void {
    if (this.alert) {
      this.alert.dismiss();
    }
    if (this.actionSheet) {
      this.actionSheet.dismiss();
    }
  }

  logout() {
    this.authService.logout();
  }

  async showChangePassword() {
    this.alert = await this.alertCtrl.create({
      header: '修改密码',
      inputs: [{ name: 'oldPassword', placeholder: '旧密码', type: "password" },
      { name: 'newPassword', placeholder: '新密码', type: "password" },
      { name: 'newPassword2', placeholder: '再次输入新密码', type: "password" }],
      buttons: [
        { text: '取消', handler: data => { console.log('Cancel clicked') } },
        {
          text: '确认修改', handler: data => {
            console.log('Saved clicked');
            this.changePassword(data.oldPassword, data.newPassword, data.newPassword2);
          }
        }
      ]
    });
    this.alert.present();
  }

  changePassword(oldPassword, newPassword, newPassword2) {
    if (newPassword != newPassword2) {
      this.events.publish("provider:notice", "newPasswordNotMatch");
    }
    else if (newPassword.length < 8) {
      this.events.publish("provider:notice", "needPasswordLength");
    } else {
      this.userService.changePassword(oldPassword, newPassword).then(result => {
        console.log(result);
        if (result == true) {
          this.events.publish("provider:notice", 'changePasswordSuccess');
          this.logout()
        }
      })
    }
  }

  async showChangeUserName() {
    this.alert = await this.alertCtrl.create({
      header: '修改用户名',
      inputs: [{ name: 'newUserName', placeholder: '新用户名' }],
      buttons: [
        { text: '取消', handler: data => { console.log('Cancel clicked') } },
        {
          text: '确认修改', handler: data => {
            console.log('Saved clicked');
            this.changeUserName(data.newUserName);
          }
        }
      ]
    });
    this.alert.present();
  }

  changeUserName(newName) {
    // 判断用户名不是手机号，再提交
    if (this.getStrLeng(newName) < 6) {
      this.events.publish("provider:notice", "needUserNameLength");
    }
    else if (((newName.length == 11) && (parseInt(newName) >= 10000000000) && (parseInt(newName) <= 19999999999))) {
      this.events.publish("provider:notice", "userNameLengthToLong");
    }
    else {
      this.userService.changeProfile(newName).then(result => {
        console.log(result);
        if (result == true) {
          this.dataService.user.username = newName;
        }
      })
    }

  }

  showChangePhone() {

  }

  // changePhone() {

  // }

  // CheckNewUserNameButton() {
  //   if (this.userService.CheckTel(this.newusername)) {//如果用户新输入的用户名为手机号禁止修改
  //     this.ChangeUserNameButtonDisabled = true;
  //   } else if ((this.getStrLeng(this.newusername) < 6) || (this.getStrLeng(this.newusername) > 32)) {
  //     this.ChangeUserNameButtonDisabled = true;
  //   }
  //   else {
  //     this.ChangeUserNameButtonDisabled = false;
  //   }
  // }

  // ChangeUserNameButton() {
  //   this.userService.ModifyUserProfile(this.newusername).then(result => {
  //     //alert(result.message);
  //     console.log(result);
  //     //if (data.message == 0) return true;
  //     //else return false;
  //     if (result.message == 0) {
  //       console.log("修改用户名成功");
  //       this.userService.username = this.newusername;
  //     }
  //     else {
  //       console.log("修改用户名失败");
  //     }
  //   });
  // }

  getStrLeng(str) {
    var realLength = 0;
    var len = str.length;
    var charCode = -1;
    for (var i = 0; i < len; i++) {
      charCode = str.charCodeAt(i);
      if (charCode >= 0 && charCode <= 128) {
        realLength += 1;
      } else {
        // 如果是中文则长度加3 
        realLength += 3;
      }
    }
    return realLength;
  }

  //修改头像
  gotoChangeAvatar() {
    this.getPictureActionSheet();
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
        this.dataService.tempImgFile = 'data:image/jpeg;base64,' + imageData;
        this.router.navigate(['/user/avatar'])
      }, (err) => {
        console.log("获取图片失败");
      });
    }
    else {
      this.router.navigate(['/user/avatar']);
      this.dataService.tempImgFile = 'assets/img/headerbg.jpg';
    }
  }

  async getPictureActionSheet() {
    this.actionSheet = await this.actionSheetCtrl.create({
      header: '修改头像',
      buttons: [
        { text: '手机拍照', handler: () => { this.getPicture(1); } },
        { text: '本地图片', handler: () => { this.getPicture(0); } }
      ]
    });
    await this.actionSheet.present();
  }

}
