import { Injectable } from '@angular/core';
import {
  ToastController,
  LoadingController,
  AlertController,
  Events
} from '@ionic/angular';
import { OpenNativeSettings } from '@ionic-native/open-native-settings/ngx';
import { async } from 'q';

@Injectable({
  providedIn: 'root',
})
export class NoticeService {
  toast;
  alert;
  loading;
  loadTimer;

  toastCodeList = [
    -1,
    1100, 1101,
    1200, 1201, 1202,
    1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410,
    9999, 1412,
    'doubleClickExit', 'newPasswordNotMatch', 'userNameLengthToLong', 'needUserNameLength',
    'needPasswordLength', 'needPassword', 'needPhoneNumberOrUserName', 'copySuccess', 'importSuccess',
    'timeoutConnect', 'tooManyComponents', 'notPlaced', 'tooMuchAction', 'canNotBeUsed', 'canNotBeUsed2',
    'noNetwork', 'bleNeedLocation',
    'tooLongRoomName', 'sameRoomName', 'tooManyRooms',
    'tooManyScenes', 'tooLongSceneName', 'sameSceneName',
    'deviceShareLimit',
    'geolocationUpdated',
    'permissionDenied'
  ];
  alertCodeList = [
    1300, 1301,
    1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510,
    "openLocation", 'openWifi', "openBluetooth", 'addDeviceSuccess', 'addDeviceNoFound', 'addDeviceTimeout',
    'updateInstalled', 'changePasswordSuccess', 'noAction', 'timingOffline', 'ShortcutPinnedSuccessfully'
  ];
  // loadingCodeList;

  constructor(
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    public events: Events,
    private openNativeSettings: OpenNativeSettings
  ) {
  }

  init() {
    this.events.subscribe("provider:notice", code => {
      // console.log(code);
      if (code == 1408) {
        this.events.publish('page:home', 'unauthorized user');
      }
      this.showNotice(code);
    });
    this.events.subscribe("loading:show", content => {
      this.showLoading(content);
    });
    this.events.subscribe("loading:hide", content => {
      this.hideLoading();
    });
    this.events.subscribe("notice:hide", content => {
      this.hideLoading();
      this.hideAlert();
    });
  }

  lastTime = 0;
  lastCode = 0;
  showNotice(code) {
    if (typeof code == "object") {
      if (typeof code.title == 'undefined') {
        this.showToastObject(code);
      } else {
        this.showAlertObject(code);
      }
    } else if (this.toastCodeList.indexOf(code) > -1) {
      if ((new Date().getTime() > this.lastTime + 5000) || (this.lastCode != this.toastCodeList.indexOf(code)))//超过5s或者和上次的消息不同则弹窗
      {
        this.lastCode = this.toastCodeList.indexOf(code);
        this.showToast(code);
      }
      this.lastTime = new Date().getTime();
    } else if (this.alertCodeList.indexOf(code) > -1) {
      if ((new Date().getTime() > this.lastTime + 5000) || (this.lastCode != this.alertCodeList.indexOf(code)))//超过5s或者和上次的消息不同则弹窗
      {
        this.lastCode = this.alertCodeList.indexOf(code)
        this.showAlert(code);
      }
      this.lastTime = new Date().getTime();
    }
  }

  showToast(code) {
    this.hideLoading();
    let toast = this.toastCtrl.create(this.mess[code.toString()])
      .then(
        toast => toast.present()
      );

  }

  showAlert(code) {
    this.hideLoading();
    this.alert = this.alertCtrl.create(this.mess[code.toString()])
      .then(
        alert => alert.present()
      );
  }

  showToastObject(code) {
    this.hideLoading();
    let toast = this.toastCtrl.create(code)
      .then(
        toast => toast.present()
      );
  }

  showAlertObject(code) {
    this.hideLoading();
    this.alert = this.alertCtrl.create(code)
      .then(
        alert => alert.present()
      );
  }

  async showLoading(content) {
    console.log('showLoading');
    this.hideLoading();
    this.loading = await this.loadingCtrl.create(this.loadingMess[content])
    // console.log('135');
    this.loading.present();
    // console.log('138');
    if (content == "connect" || content == "login" || content == "load")
      this.loadTimer = window.setTimeout(async () => {
        let toast = await this.toastCtrl.create(this.loadTimeoutMess[content])
        toast => toast.present()
        if (typeof this.loading != 'undefined') {
          this.loading.dismiss();
        }
      }, 10000);
  }

  // changeLoading(content) {
  //   this.loading.config
  // }

  hideLoading() {
    if (typeof this.loading != 'undefined')
      this.loading.dismiss();
  }

  hideAlert() {
    if (this.alert) {
      this.alert.dismiss();
    }
  }

  loadingMess = {
    "connect": {
      message: `连接中...`,
      enableBackdropDismiss: true
    },
    "login": {
      message: `登录中...`
    },
    "load": {
      message: `加载中...`
    },
    "upload": {
      message: `上传中...`
    },
    "addDevice": {
      message: `设备注册中...`
    },
    "updateDownloading": {
      message: `更新下载中...`
    },
    "updateInstalling": {
      message: `更新安装中...`
    },
    "loadingTiming": {
      message: `同步定时任务中...`
    }
  }

  loadTimeoutMess = {
    'connect': {
      message: '连接失败，请稍后再试',
      duration: 5000,
      position: 'middle'
    },
    'login': {
      message: '登录失败，请稍后再试',
      duration: 5000,
      position: 'middle'
    },
    'load': {
      message: '加载失败，请稍后再试',
      duration: 5000,
      position: 'middle'
    }
  }

  mess = {
    "-1": {
      message: '未知错误',
      duration: 5000,
      position: 'top'
    },
    '1100': {
      message: 'Error:1100',
      duration: 5000,
      position: 'top'
    },
    '1101': {
      message: 'Error:1101',
      duration: 3000,
      position: 'top'
    },
    '1200': {
      message: '短信发送失败，请稍后再试',
      duration: 5000,
      position: 'top'
    },
    '1201': {
      message: '短信验证码错误',
      duration: 5000,
      position: 'top'
    },
    '1202': {
      message: 'Error:1202',
      duration: 3000,
      position: 'top'
    },
    '1300': {
      message: 'Error:1300',
      duration: 3000,
      position: 'top'
    },
    '1301': {
      message: 'Error:1301',
      duration: 3000,
      position: 'top'
    },
    '1400': {
      message: '用户名或密码错误',
      duration: 3000,
      position: 'top'
    },
    '1401': {
      message: '该手机号已注册过，请直接登录',
      duration: 6000,
      position: 'top'
    },
    '1402': {
      message: '用户名修改失败，新用户名已存在',
      duration: 3000,
      position: 'top'
    },
    '1403': {
      message: '用户信息获取失败，请稍后再试',
      duration: 5000,
      position: 'top'
    },
    '1404': {
      message: '密码错误',
      duration: 3000,
      position: 'top'
    },
    '1405': {
      message: 'Error:1405',
      duration: 3000,
      position: 'top'
    },
    '1406': {
      message: 'Error:1406',
      duration: 3000,
      position: 'top'
    },
    '1407': {
      message: '用户名格式错误，修改失败',
      duration: 3000,
      position: 'top'
    },
    '1408': {
      message: '登录超时，或账号已在其他设备登录，请重新登录',
      duration: 3000,
      position: 'top'
    },
    '1409': {
      message: 'Error:1409',
      duration: 3000,
      position: 'top'
    },
    '1410': {
      message: '设备信息获取失败，请稍后再试',
      duration: 3000,
      position: 'top'
    },
    '1412': {
      message: '没有找到这个用户，请确认该手机号是否正确',
      duration: 4000,
      position: 'top'
    },
    '1500': {
      message: '添加设备失败',
      duration: 3000,
      position: 'top'
    },
    '1501': {
      message: 'Error:1501',
      duration: 3000,
      position: 'top'
    },
    '1502': {
      message: '解绑设备失败',
      duration: 3000,
      position: 'top'
    },
    '1503': {
      header: '保存设备配置失败',
      message: '可能是服务器错误造成了这个问题，请稍后再试',
      buttons: ['重试']
    },
    '1504': {
      message: '获取设备配置失败',
      duration: 3000,
      position: 'top'
    },
    '1505': {
      header: '设备添加失败',
      message: '该设备已被他人绑定，请先解绑设备，再进行配置',
      buttons: ['重试']
    },
    '1506': {
      message: 'Error:1506',
      duration: 3000,
      position: 'top'
    },
    '1507': {
      message: '获取设备数据失败',
      duration: 3000,
      position: 'top'
    },
    '1508': {
      header: '暂不支持该设备',
      message: '设备支持情况可见https://blinker-iot.com/',
      buttons: ['重试']
    },
    '1509': {
      message: 'Error:1509',
      duration: 3000,
      position: 'top'
    },
    '1510': {
      header: 'MQTT设备数量超出限制',
      message: '当前用户Diy设备已达上限,如需更多设备，请联系blinker团队',
      buttons: ['确认']
    },
    '9999': {
      message: '服务器未响应，请稍后再试',
      duration: 3000,
      position: 'top'
    },
    'noNetwork': {
      message: '无法连接网络，请检查是否连接了wifi或移动网络',
      duration: 5000,
      position: 'top'
    },
    'noNetworkError': {
      message: '无法连接网络，请检查手机设置是否阻止了后台网络通信',
      duration: 10000,
      position: 'top'
    },
    'addDeviceSuccess': {
      header: '设备添加成功',
      message: '现在，你已经可以控制该设备',
      buttons: ['开始使用']
    },
    'copySuccess': {
      message: '已复制到剪切板',
      duration: 3000,
      position: 'top'
    },
    'importSuccess': {
      message: '数据导入成功',
      duration: 3000,
      position: 'top'
    },
    // "getMqttKeySuccess":{

    // }
    // 'addDeviceRegistered': {
    //   header: '设备添加失败',
    //   message: '设备已被他人绑定，请先解绑设备，再进行配置',
    //   buttons: ['重试']
    // },
    'addDeviceNoFound': {
      header: '没有发现设备',
      message: '请确保设备已上电，且黄灯闪烁，靠近设备，再重新尝试',
      buttons: ['重试']
    },
    'addDeviceTimeout': {
      header: '设备添加失败',
      message: '请确保设备已上电，且黄灯闪烁，靠近设备，再重新尝试',
      buttons: ['重试']
    },
    "openBluetooth": {
      header: '未开启蓝牙',
      message: '请先打开蓝牙，再进行相关操作',
      buttons: [{
        text: '打开蓝牙',
        handler: () => {
          this.openNativeSettings.open("bluetooth");
        }
      }]
    },
    "openWifi": {
      header: '手机未连接到热点,或没有开启位置权限',
      message: '请连接到热点或开启位置权限，再进行设备配置',
      buttons: [{
        text: '确认',
        handler: () => {
          this.openNativeSettings.open("wifi");
        }
      }]
    },
    "openLocation": {
      header: '手机未打开定位服务,或没有开启位置权限',
      message: '请开启位置权限，或者在打开隐私定位服务',
      buttons: [{
        text: '确认',
        handler: () => {
          this.openNativeSettings.open("Location");
        }
      }]
    },
    'needPhoneNumberOrUserName': {
      message: '手机号码或用户名错误，请重新输入',
      duration: 3000,
      position: 'top'
    },
    'needPassword': {
      message: '密码格式不正确，请输入8位以上的密码',
      duration: 3000,
      position: 'top'
    },
    'needPasswordLength': {
      message: '密码过短，请输入8位以上的密码',
      duration: 3000,
      position: 'top'
    },
    'needUserNameLength': {
      message: '用户名过短，请输入6位以上的用户名',
      duration: 3000,
      position: 'top'
    },
    'userNameLengthToLong': {
      message: '用户名不能为11位纯数字',
      duration: 3000,
      position: 'top'
    },
    'newPasswordNotMatch': {
      message: '两次输入的新密码不匹配',
      duration: 3000,
      position: 'top'
    },
    // 双击退出提示
    "doubleClickExit": {
      message: '再按一次退出应用',
      duration: 2000,
      position: 'top'
    },
    "updateInstalled": {
      header: '更新完成',
      message: '感谢您使用blinker',
      buttons: ['开始使用']
    },
    "changePasswordSuccess": {
      header: '密码已变更，请重新登录',
      message: '感谢您使用blinker',
      buttons: ['开始使用']
    },
    'timeoutConnect': {
      message: '连接超时，请稍后再试',
      duration: 3000,
      position: 'middle'
    },
    'timeoutLogin': {
      message: '登录超时，请稍后再试',
      duration: 3000,
      position: 'middle'
    },
    'timeoutLoad': {
      message: '加载失败，请稍后再试',
      duration: 3000,
      position: 'middle'
    },
    // 'tooManyComponents': {
    //   message: '组件数量超出限制，你最多能添加99个组件',
    //   duration: 3000,
    //   position: 'top'
    // },
    'notPlaced': {
      message: '没有空间添加该组件，请先删除一些组件，再尝试添加',
      duration: 2500,
      position: 'top'
    },
    'noAction': {
      header: '你没有添加设备动作',
      message: '请先添加设备动作，再点击保存',
      buttons: ['添加设备动作']
    },
    'tooMuchAction': {
      message: '一个任务最多能执行两个动作',
      duration: 2500,
      position: 'top'
    },
    'canNotBeUsed': {
      message: '当前模式下无法使用该功能',
      duration: 2500,
      position: 'top'
    },
    'canNotBeUsed2': {
      message: '当前账号无法使用该功能',
      duration: 2500,
      position: 'top'
    },
    'timingOffline': {
      header: '设备不在线',
      message: '请先上线设备，才能获取和设置定时任务',
      buttons: ['确认']
    },
    'ShortcutPinnedSuccessfully': {
      header: '添加成功',
      message: '已成功将设备添加到桌面',
      buttons: ['确认']
    },
    'bleNeedLocation': {
      message: '使用蓝牙ble，需要先开启手机定位服务',
      duration: 3500,
      position: 'top'
    },
    'tooManyRooms': {
      message: '房间数量超出限制。 请删除一些房间，再尝试新建',
      duration: 5500,
      position: 'top'
    },
    'tooLongRoomName': {
      message: '房间名超出长度限制。 最长10个字符',
      duration: 5500,
      position: 'top'
    },
    'sameRoomName': {
      message: '这个房间已存在。 请设置一个新的房间名称，或点击已有房间进行管理',
      duration: 5500,
      position: 'top'
    },
    'tooManyScenes': {
      message: '场景数量超出限制。 请删除一些场景，再尝试新建',
      duration: 5500,
      position: 'top'
    },
    'tooLongSceneName': {
      message: '场景名超出长度限制。 最长10个字符',
      duration: 5500,
      position: 'top'
    },
    'sameSceneName': {
      message: '这个场景名已存在。 请使用其他场景名',
      duration: 5500,
      position: 'top'
    },
    'deviceShareLimit': {
      message: '一个设备最多可共享给9个用户',
      duration: 5000,
      position: 'top'
    },
    'geolocationUpdated': {
      message: '设备位置信息已更新',
      duration: 3000,
      position: 'top'
    },
    'permissionDenied': {
      message: '您的账号无法使用该功能',
      duration: 3000,
      position: 'top'
    },
    'notJson':{
      message: '输入的数据，不是一个有效的JSON数据',
      duration: 3000,
      position: 'top'
    }
  }


}