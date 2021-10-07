import { Component } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  ModalController
} from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { Subscription } from 'rxjs';
import { NoticeService } from 'src/app/core/services/notice.service';
import { AvatarPickerComponent } from 'src/app/core/pages/avatar/avatar-picker.component';

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss']
})
export class UserPage {
  alert;
  actionSheet;
  loaded = false;

  get user() {
    return this.dataService.user
  }

  avatar = this.user.avatar;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    public actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    public modalCtrl: ModalController,
    public noticeService: NoticeService,
    private dataService: DataService
  ) { }

  subscription: Subscription;

  ngOnInit(): void {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
      }
    })
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
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
      this.noticeService.showToast("newPasswordNotMatch");
    }
    else if (newPassword.length < 8) {
      this.noticeService.showToast("needPasswordLength");
    } else {
      this.userService.changePassword(oldPassword, newPassword).then(result => {
        console.log(result);
        if (result == true) {
          this.noticeService.showToast("changePasswordSuccess");
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
      this.noticeService.showToast("needUserNameLength");
    }
    else if (((newName.length == 11) && (parseInt(newName) >= 10000000000) && (parseInt(newName) <= 19999999999))) {
      this.noticeService.showToast("userNameLengthToLong");
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
  async gotoChangeAvatar() {
    const modal = await this.modalCtrl.create({
      component: AvatarPickerComponent
    });
    await modal.present();
    await modal.onWillDismiss();
    this.dataService.updateAvatarCache();
  }

  async showCancelAlert() {
    if (this.dataService.device.list.length > 0) {
      this.showCancelAlert2();
      return
    }

    this.alert = await this.alertCtrl.create({
      header: '注销账号',
      subHeader: '输入密码确认注销操作',
      message: `望知悉：账号注销后，相关数据将被永久删除，且无法找回！`,
      inputs: [
        { name: 'password', placeholder: '当前账号密码' },
      ],
      buttons: [
        { text: '取消', handler: data => { } },
        {
          text: '确认修改', handler: data => {
            this.cancelAccount(data.password);
          }
        }
      ]
    });
    this.alert.present();
  }

  async showCancelAlert2() {
    this.alert = await this.alertCtrl.create({
      header: '注销账号',
      message: `账号中有绑定${this.dataService.device.list.length}个设备，请先解绑所有设备，再进行注销操作`,
      buttons: [
        { text: '确认', handler: data => { } },
      ]
    });
    this.alert.present();
  }

  async showCancelAlert3() {
    this.alert = await this.alertCtrl.create({
      header: '成功注销',
      message: `期待您再次使用本方案`,
      buttons: [
        { text: '确认', handler: data => { this.logout() } },
      ]
    });
    this.alert.present();
  }

  cancelAccount(password) {
    this.userService.cancelAccount(password).then(result => {
      if (result) {
        this.showCancelAlert3();
      }
    });
  }

}
