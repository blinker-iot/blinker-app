import { Component, OnInit } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { AlertController, NavController, ModalController } from '@ionic/angular';
import { DeviceIconPage } from 'src/app/core/pages/device-icon/device-icon';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';

@Component({
  selector: 'prodevice-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {

  get prodevice() {
    return this.devcenterService.currentProDevice
  }

  deviceType = '';
  authKey;

  constructor(
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private deviceConfigService: DeviceConfigService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    this.devcenterService.getProDeviceConfig(this.deviceType)
  }

  ngOnDestroy() {
    // this.deviceConfigService.getDevDeviceConfig();
  }

  async selectIcon() {
    let modal = await this.modalCtrl.create({
      component: DeviceIconPage,
    });
    modal.present();
    // this.prodevice['image'] = (
    modal.onDidDismiss()
      .then(image => {
        let config = {
          image: image.data
        }
        this.devcenterService.setProDeviceConfig(this.deviceType, config)
          .then(result => {
            if (result) this.prodevice['image'] = image.data;
          })
      });
  }

  async changeName() {
    let alert = await this.alertCtrl.create({
      header: '修改设备名',
      inputs: [{ name: 'newName', placeholder: '新设备名' }],
      buttons: [
        { text: '取消', handler: data => { console.log('Cancel clicked') } },
        {
          text: '确认修改', handler: data => {
            console.log('Saved clicked');
            let config = {
              name: data.newName
            }
            this.devcenterService.setProDeviceConfig(this.deviceType, config)
              .then(result => {
                if (result)
                  this.prodevice['name'] = data.newName
              })
          }
        }
      ]
    });
    alert.present();
  }

  async showAuthKey() {
    this.devcenterService.getProDeviceAuthKey(this.deviceType).then(result => {
      this.authKey = result;
    })
  }

  async showDelWarn() {
    let confirm = await this.alertCtrl.create({
      header: '删除专属设备',
      subHeader: '警告：删除后，其他用户已添加的本类设备将无法使用！\n如确认删除，请输入登录密码用以确认删除操作。',
      inputs: [
        {
          name: 'password',
          placeholder: '密码'
        },
      ],
      buttons: [
        {
          text: '取消',
          handler: () => {
          }
        },
        {
          text: '确认删除',
          handler: data => {
            this.devcenterService.delProDevice(this.deviceType, data.password).then(result => {
              if (result) {
                this.navCtrl.pop();
                this.devcenterService.getProDevices();
              }
            })
          }
        }
      ]
    });
    confirm.present();
  }

  editUI() {

  }

  Public() {

  }

}
