import {
  Component,
  ElementRef,
  ViewChild
} from '@angular/core';
import {
  IonicPage,
  NavController,
  NavParams, AlertController,
  Events,
  Platform,
  // Navbar,
  ModalController
} from 'ionic-angular';
import { arrayRemove } from '../../functions/func';
import { AutoProvider } from '../../providers/auto/auto';
import { UserProvider } from '../../providers/user/user';
import { DeviceProvider } from '../../providers/device/device';

@IonicPage()
@Component({
  selector: 'page-scene-edit',
  templateUrl: 'scene-edit.html',
})
export class SceneEditPage {

  public showExample = false;
  public enable: boolean = false;
  mode = 'add';
  originScene;
  public scene = {
    name: "新的模式",
    ico: "fal fa-question-circle",
    actions: [
      // { devicename: "30AEA4244BF4ORZ88QHTJRRC", content: "开灯", key: "tog-abc", value: "on" },
      // { devicename: "30AEA4244BF4ORZ88QHTJRRB", content: "开灯", key: "tog-abc", value: "on" },
      // { devicename: "30AEA4244BF4ORZ88QHTJRRA", content: "开灯", key: "tog-abc", value: "on" },
      // { devicename: "30AEA4244BF4ORZ88QHTJRRD", content: "开灯", key: "tog-abc", value: "on" },
    ]
  }

  @ViewChild("scrollContainer", { read: ElementRef }) scrollContainer: ElementRef;
  // @ViewChild("navbar") navbar: Navbar;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    // public navbar:Navbar,
    public modalCtrl: ModalController,
    public alertCtrl: AlertController,
    // public deviceProvider: DeviceProvider,
    public autoProvider: AutoProvider,
    public userProvider: UserProvider,
    public deviceProvider: DeviceProvider,
    public events: Events,
    public platform: Platform
  ) {
    // console.log(navParams.data);
    if (typeof (navParams.data.name) != 'undefined') {
      this.originScene = navParams.data;
      this.scene = JSON.parse(JSON.stringify(navParams.data));
      this.mode = 'edit';
    } else {
      this.originScene = JSON.parse(JSON.stringify(this.scene));
    }

  }

  ionViewWillLeave() {
    if (this.alert0) {
      this.alert0.dismiss();
    }
  }

  choseIcon() {
    let modal = this.modalCtrl.create("IconPage", this.scene);
    modal.present();
  }

  alert0;
  changeName() {
    this.alert0 = this.alertCtrl.create({
      title: '修改模式名称',
      inputs: [
        {
          name: 'name',
          placeholder: '模式名称'
        },
      ],
      buttons: [
        {
          text: '取消',
          handler: data => {
            console.log('Cancel clicked');
          }
        },
        {
          text: '确认',
          handler: data => {
            console.log('Saved clicked');
            this.scene.name = data.name;
          }
        }
      ]
    });
    this.alert0.present();
  }

  addScene() {
    let modal = this.modalCtrl.create('SceneEditAddactPage', this.scene);
    modal.present();
    this.canExit = false;
  }

  delSceneDevice(id) {
    arrayRemove(this.scene.actions, id);
    this.canExit = false;
  }

  scrollToBottom() {
    window.setTimeout(() => {
      this.scrollContainer.nativeElement.children[0].scrollTop = this.scrollContainer.nativeElement.children[0].scrollHeight;
    }, 50)
  }

  save() {
    if (this.scene.actions.length == 0) {
      this.events.publish('provider:notice', 'noAction');
      return;
    }
    if (this.checkChanges()) {
      if (this.mode == 'add') {
        this.autoProvider.sceneButtonList.push(this.scene);
      } else {
        this.originScene.name = this.scene.name;
        this.originScene.ico = this.scene.ico;
        this.originScene.actions = this.scene.actions;
      }
      let userConfig = {
        "sceneButtonList": this.autoProvider.sceneButtonList
      }
      console.log(this.autoProvider.sceneButtonList);
      this.userProvider.saveUserConfig(userConfig);
    }
    this.canExit = true;
    this.navCtrl.pop();
  }
  //未保存提示
  //1.有变更，提示保存
  ionViewCanLeave() {
    if (!this.checkChanges()) return true;
    if (this.canExit) return true;
    this.unsavedAlert();
    return false;
  }

  checkChanges() {
    if (JSON.stringify(this.originScene) == JSON.stringify(this.scene))
      return false;
    return true;
  }

  alert;
  canExit = true;
  unsavedAlert() {
    let showAlert = false;
    if (this.alert) {
      if (this.alert._state == 4)
        showAlert = true
    } else {
      showAlert = true
    }
    if (showAlert) {
      this.alert = this.alertCtrl.create({
        title: '退出编辑模式',
        subTitle: '当前场景未保存，是否直接退出？',
        buttons: [
          {
            text: '取消',
            handler: data => {
              console.log('Cancel clicked');
            }
          },
          {
            text: '退出',
            handler: data => {
              console.log('Saved clicked');
              this.canExit = true;
              this.navCtrl.pop();
            }
          }
        ]
      });
      this.alert.present();
    }
  }

  devicename2img(devicename) {
    return this.deviceProvider.devices[devicename].config.image
  }

  devicename2customName(devicename) {
    return this.deviceProvider.devices[devicename].config.customName
  }

}
