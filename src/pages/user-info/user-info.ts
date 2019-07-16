import { Component } from '@angular/core';
import {
  IonicPage,
  NavController,
  App,
  Events,
  ActionSheetController,
  AlertController,
  ModalController
} from 'ionic-angular';
import { UserProvider } from '../../providers/user/user';
import { LoginPage } from '../login/login';
import { Camera, CameraOptions } from '@ionic-native/camera';
import { DeviceProvider } from '../../providers/device/device';
@IonicPage()
@Component({
  selector: 'page-user-info',
  templateUrl: 'user-info.html'
})
export class UserInfoPage {
  alert;
  actionSheet;

  constructor(
    public navCtrl: NavController,
    public userProvider: UserProvider,
    private camera: Camera,
    public actionSheetCtrl: ActionSheetController,
    private app: App,
    public deviceProvider: DeviceProvider,
    private alertCtrl: AlertController,
    public modalCtrl: ModalController,
    public events: Events
  ) { }

  ionViewWillLeave() {
    if (this.alert) {
      this.alert.dismiss();
    }
    if (this.actionSheet) {
      this.actionSheet.dismiss();
    }
  }

  showChangePassword() {
    this.alert = this.alertCtrl.create({
      title: '修改密码',
      // message: " ",
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
      this.userProvider.changePassword(oldPassword, newPassword).then(result => {
        console.log(result);
        if (result == true) {
          this.events.publish("provider:notice", 'changePasswordSuccess');
          this.deviceProvider.disconnectMqttBroker();
          this.userProvider.logout();
          this.app.getRootNav().setRoot(LoginPage);
          this.navCtrl.goToRoot;
        }
      })
    }
    //判断两次密码一样，并大于八位
  }

  showChangeUserName() {
    this.alert = this.alertCtrl.create({
      title: '修改用户名',
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
    //判断用户名不是手机号，再提交
    if (this.getStrLeng(newName) < 6) {
      this.events.publish("provider:notice", "needUserNameLength");
    }
    else if (((newName.length == 11) && (parseInt(newName) >= 10000000000) && (parseInt(newName) <= 19999999999))) {
      this.events.publish("provider:notice", "userNameLengthToLong");
    }
    else {
      this.userProvider.changeProfile(newName).then(result => {
        console.log(result);
        if (result == true) {
          this.userProvider.localStorage.user.username = newName;
        }
      })
    }

  }

  showChangePhone() {

  }

  // changePhone() {

  // }

  // CheckNewUserNameButton() {
  //   if (this.userProvider.CheckTel(this.newusername)) {//如果用户新输入的用户名为手机号禁止修改
  //     this.ChangeUserNameButtonDisabled = true;
  //   } else if ((this.getStrLeng(this.newusername) < 6) || (this.getStrLeng(this.newusername) > 32)) {
  //     this.ChangeUserNameButtonDisabled = true;
  //   }
  //   else {
  //     this.ChangeUserNameButtonDisabled = false;
  //   }
  // }

  // ChangeUserNameButton() {
  //   this.userProvider.ModifyUserProfile(this.newusername).then(result => {
  //     //alert(result.message);
  //     console.log(result);
  //     //if (data.message == 0) return true;
  //     //else return false;
  //     if (result.message == 0) {
  //       console.log("修改用户名成功");
  //       this.userProvider.username = this.newusername;
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
    // this.navCtrl.push("UserAvatarPage", "");
  }

  getPicture(sourceType) {
    const options: CameraOptions = {
      quality: 50,
      sourceType: sourceType,
      destinationType: this.camera.DestinationType.DATA_URL,
      encodingType: this.camera.EncodingType.JPEG,
      mediaType: this.camera.MediaType.PICTURE
    }
    this.camera.getPicture(options).then((imageData) => {
      let base64Image = 'data:image/jpeg;base64,' + imageData;
      this.navCtrl.push("UserAvatarPage", base64Image);
    }, (err) => {
      console.log("获取图片失败");
    });
  }

  getPictureActionSheet() {
    this.actionSheet = this.actionSheetCtrl.create({
      title: '修改头像',
      buttons: [
        { text: '手机拍照', handler: () => { this.getPicture(1); } },
        { text: '本地图片', handler: () => { this.getPicture(0); } }
      ]
    });
    this.actionSheet.present();
  }

}
