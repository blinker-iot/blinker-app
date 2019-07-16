import { UserProvider } from '../../providers/user/user';
import { Component, Input } from '@angular/core';
import { IonicPage, NavController } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'user-tel',
  templateUrl: 'user-tel.html'
})
export class UserTelPage {
  @Input() events: any;
  oldcheckNumber: string;
  newcheckNumber: string;
  newtel: string;
  OldcheckNumberTitle: string = "发送验证码";
  NewcheckNumberTitle: string = "发送验证码";
  OldTelcheckButtonDisabled: boolean = false;
  NewTelNumberButtonDisabled: boolean = false;
  ChangeTelButtonDisabled: boolean = false;

  OldTelcheckNumberDisabled: boolean = false;
  NewTelcheckNumberDisabled: boolean = false;
  NewTelNumberDisabled: boolean = false;

  constructor(
    public navCtrl: NavController,
    public userProvider: UserProvider, 
  ) { }

  onEvent = (event: string): void => {
    if (this.events[event]) {
      this.events[event]({
        'oldcheckNumber': this.oldcheckNumber,
        'newcheckNumber': this.newcheckNumber,
        'newtel': this.newtel,
      });
    }
  }

  // checknewtel() {
  //   if ((this.userProvider.checkTel(this.newtel)) && (this.userProvider.checkCheckNumber(this.oldcheckNumber)))
  //     this.NewTelNumberButtonDisabled = false;
  //   else this.NewTelNumberButtonDisabled = false;
  // }

  checkoldchecknumber() {
    // if (this.userProvider.checkCheckNumber(this.oldcheckNumber)) { }


  }

  // GetOldTelCheckNumberButton() {
  //   this.OldTelcheckNumberDisabled = false;
  //   this.NewTelcheckNumberDisabled = false;
  //   this.userProvider.getCheckNumber2OldTel().then(result => {
  //     if (result) {
  //       console.log("验证码短信已发送至" + this.userProvider.tel);
  //       alert("验证码短信已发送至" + this.userProvider.tel);
  //       this.NewTelcheckNumberDisabled = false;
  //     }
  //     else {
  //       console.log("短信发送失败,请60秒后重新尝试");
  //       alert("短信发送失败,请60秒后重新尝试");
  //     }
  //   })
  //   let countdown = 60;
  //   let t = setInterval(() => {
  //     countdown = countdown - 1;
  //     if (countdown == 0) {
  //       this.OldcheckNumberTitle = "重新发送";
  //       this.OldTelcheckNumberDisabled = false;
  //       clearInterval(t);
  //     } else {
  //       this.OldcheckNumberTitle = "重新发送(" + countdown + ")";
  //     }
  //   }, 1000)
  // }
  // GetNewTelCheckNumberButton() {
  //   this.userProvider.verifyUsersOldTel(this.oldcheckNumber).then(result => {
  //     if (result) {
  //       console.log("验证原手机成功");
  //       this.userProvider.getCheckNumber2NewTel(this.newtel).then(result => {
  //         if (result) {
  //           console.log("验证码短信已发送至" + this.newtel);
  //         }
  //         else {
  //           console.log("短信发送失败,请60秒后重新尝试");
  //         }
  //       })
  //       this.NewTelcheckNumberDisabled = false;
  //       let countdown = 60;
  //       let t = setInterval(() => {
  //         countdown = countdown - 1;
  //         if (countdown == 0) {
  //           this.NewcheckNumberTitle = "重新发送";
  //           this.NewTelcheckNumberDisabled = false;
  //           clearInterval(t);
  //         } else {
  //           this.NewcheckNumberTitle = "重新发送(" + countdown + ")";
  //         }
  //       }, 1000)
  //     }
  //     else {
  //       console.log("短信发送失败,请60秒后重新尝试");
  //     }
  //   })
  // }

  // ChangeTelButton() {
  //   console.log(this.newtel);

  //   this.userProvider.verifyUsersNewTel(this.newtel, this.newcheckNumber).then(result => {
  //     if (result) {
  //       console.log("修改手机号码成功");
  //     }
  //     else {
  //       console.log("修改手机号码失败");
  //     }
  //   })

  //   //this.ChangeTelDisabled = false;
  //   let countdown = 60;
  //   let t = setInterval(() => {
  //     countdown = countdown - 1;
  //     if (countdown == 0) {
  //       this.NewcheckNumberTitle = "重新发送";
  //       //this.ChangeTelDisabled = false;
  //       clearInterval(t);
  //     } else {
  //       this.NewcheckNumberTitle = "重新发送(" + countdown + ")";
  //     }
  //   }, 1000)
  // }

}
