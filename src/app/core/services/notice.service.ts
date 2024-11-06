import { Injectable } from '@angular/core';
import {
  ToastController,
  LoadingController,
  AlertController
} from '@ionic/angular';
// import { OpenNativeSettings } from '@awesome-cordova-plugins/open-native-settings/ngx';
import { TipService } from './tip.service';

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
    'permissionDenied',
    'notJson'
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
    // private openNativeSettings: OpenNativeSettings,
    private tipService: TipService
  ) {
  }

  init() {
  }

  lastTime = 0;
  lastCode = 0;


  async showToast(code, delay = 5000) {
    this.hideLoading();
    // console.log(code);
    if (typeof this.mess[code.toString()] != 'undefined')
      this.tipService.show(this.mess[code.toString()])
    else
      this.tipService.show({ message: code.toString(), delay: delay })
  }

  async showAlert(code) {
    this.hideLoading();
    if (typeof code == 'string')
      this.alert = await this.alertCtrl.create({
        message: code,
      })
    else
      this.alert = await this.alertCtrl.create(this.mess[code.toString()])
    this.alert.present()
  }

  async showLoading(content) {
    console.log('showLoading');
    this.hideLoading();
    this.loading = await this.loadingCtrl.create(this.loadingMess[content])
    await this.loading.present();
    if (content == "connect" || content == "login" || content == "load")
      this.loadTimer = window.setTimeout(async () => {
        let toast = await this.toastCtrl.create(this.loadTimeoutMess[content])
        toast => toast.present()
        if (typeof this.loading != 'undefined') {
          this.loading.dismiss();
        }
      }, 10000);
    return
  }

  async hideLoading() {
    if (typeof this.loading != 'undefined')
      await this.loading.dismiss();
    return
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
      type: 'error'
    },
    '1100': {
      message: 'Error:1100',
      type: 'error'
    },
    '1101': {
      message: 'Error:1101',
      type: 'error'
    },
    '1200': {
      message: '短信发送失败，请稍后再试',
      type: 'error'
    },
    '1201': {
      message: '短信验证码错误',
      type: 'error'
    },
    '1202': {
      message: 'Error:1202',
      type: 'error'
    },
    '1300': {
      message: 'Error:1300',
      type: 'error'
    },
    '1301': {
      message: 'Error:1301',
      type: 'error'
    },
    '1400': {
      message: '用户名或密码错误',
      type: 'warn',
    },
    '1401': {
      message: '该手机号已注册过，请直接登录',
      type: 'warn'
    },
    '1402': {
      message: '用户名修改失败，新用户名已存在',
      type: 'warn'
    },
    '1403': {
      message: '用户信息获取失败，请稍后再试',
      type: 'error'
    },
    '1404': {
      message: '密码错误',
      type: 'warn'
    },
    '1405': {
      message: 'Error:1405',
      type: 'error'
    },
    '1406': {
      message: 'Error:1406',
      type: 'error'
    },
    '1407': {
      message: '用户名格式错误，修改失败',
      type: 'warn'
    },
    '1408': {
      message: '登录超时，或账号已在其他设备登录，请重新登录',
      type: 'warn'
    },
    '1409': {
      message: 'Error:1409',
      type: 'warn'
    },
    '1410': {
      message: '设备信息获取失败，请稍后再试',
      type: 'error'
    },
    '1412': {
      message: '没有找到这个用户，请确认该手机号是否正确',
      type: 'warn'
    },
    '1500': {
      message: '添加设备失败',
      type: 'error'
    },
    '1501': {
      message: 'Error:1501',
      type: 'error'
    },
    '1502': {
      message: '解绑设备失败',
      type: 'error'
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
      type: 'error'
    },
    '1510': {
      header: 'MQTT设备数量超出限制',
      message: '当前用户Diy设备已达上限,如需更多设备，请联系blinker团队',
      buttons: ['确认']
    },
    '1801': {
      message: '想将设备分享给另一个你？再注册一个账号吧',
      type: 'warn'
    },
    '9999': {
      message: '服务器未响应，请稍后再试',
      type: 'warn'
    },
    'noNetwork': {
      message: '无法连接网络，请检查是否连接了wifi或移动网络',
      type: 'warn'
    },
    'noNetworkError': {
      message: '无法连接网络，请检查手机设置是否阻止了后台网络通信',
      type: 'warn'
    },
    'addDeviceSuccess': {
      header: '设备添加成功',
      message: '现在，你已经可以控制该设备',
      buttons: ['开始使用']
    },
    'copySuccess': {
      message: '已复制到剪切板',
      type: 'done'
    },
    'importSuccess': {
      message: '数据导入成功',
      type: 'done'
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
          // this.openNativeSettings.open("bluetooth");
        }
      }]
    },
    "openWifi": {
      header: '手机未连接到热点,或没有开启定位服务',
      message: '请连接到热点或开启定位服务，再进行设备配置',
      buttons: [{
        text: '确认',
        handler: () => {
          // this.openNativeSettings.open("wifi");
        }
      }]
    },
    "openLocation": {
      header: '手机未打开定位服务',
      message: '本功能依赖定位服务，需开启后方可使用',
      buttons: [{
        text: '确认',
        handler: () => {
          // this.openNativeSettings.open("Location");
        }
      }]
    },
    'needPhoneNumberOrUserName': {
      message: '手机号码或用户名错误，请重新输入',
      type: 'warn'
    },
    'needPassword': {
      message: '密码格式不正确，请输入8位以上的密码',
      type: 'warn'
    },
    'needPasswordLength': {
      message: '密码过短，请输入8位以上的密码',
      type: 'warn'
    },
    'needUserNameLength': {
      message: '用户名过短，请输入6位以上的用户名',
      type: 'warn'
    },
    'userNameLengthToLong': {
      message: '用户名不能为11位纯数字',
      type: 'warn'
    },
    'newPasswordNotMatch': {
      message: '两次输入的新密码不匹配',
      type: 'warn'
    },
    // 双击退出提示
    "doubleClickExit": {
      message: '再按一次退出应用',
      type: 'warn'
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
      type: 'warn'
    },
    'timeoutLogin': {
      message: '登录超时，请稍后再试',
      type: 'warn'
    },
    'timeoutLoad': {
      message: '加载失败，请稍后再试',
      type: 'warn'
    },
    // 'tooManyComponents': {
    //   message: '组件数量超出限制，你最多能添加99个组件',
    //   duration: 3000,
    //   position: 'top'
    // },
    'notPlaced': {
      message: '没有空间添加该组件，请先删除一些组件，再尝试添加',
      type: 'warn'
    },
    'noAction': {
      header: '你没有添加设备动作',
      message: '请先添加设备动作，再点击保存',
      buttons: ['添加设备动作']
    },
    'tooMuchAction': {
      message: '一个任务最多能执行两个动作',
      type: 'warn'
    },
    'canNotBeUsed': {
      message: '当前模式下无法使用该功能',
      type: 'warn'
    },
    'canNotBeUsed2': {
      message: '当前账号无法使用该功能',
      type: 'warn'
    },
    'canNotBeUsed3': {
      message: '该组件仅限专业版用户使用',
      type: 'warn'
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
    'ShortcutPinnedfailed': {
      header: '添加失败',
      message: '请先通过 权限设置 允许本应用创建桌面快捷方式，再进行添加',
      buttons: [{
        text: '确认',
        handler: () => {
          // this.openNativeSettings.open("application_details");
        }
      }]
    },
    'bleNeedLocation': {
      message: '使用蓝牙ble，需要先开启手机定位服务',
      type: 'warn'
    },
    'tooManyRooms': {
      message: '房间数量超出限制。 请删除一些房间，再尝试新建',
      type: 'warn'
    },
    'tooLongRoomName': {
      message: '房间名超出长度限制。 最长10个字符',
      type: 'warn'
    },
    'sameRoomName': {
      message: '这个房间已存在。 请设置一个新的房间名称，或点击已有房间进行管理',
      type: 'warn'
    },
    'tooManyScenes': {
      message: '场景数量超出限制。 请删除一些场景，再尝试新建',
      type: 'warn'
    },
    'tooLongSceneName': {
      message: '场景名超出长度限制。 最长10个字符',
      type: 'warn'
    },
    'sameSceneName': {
      message: '这个场景名已存在。 请使用其他场景名',
      type: 'warn'
    },
    'deviceShareLimit': {
      message: '一个设备最多可共享给9个用户',
      type: 'warn'
    },
    'geolocationUpdated': {
      message: '设备位置信息已更新',
      type: 'done'
    },
    'permissionDenied': {
      message: '您的账号无法使用该功能',
      type: 'warn'
    },
    'notJson': {
      message: '输入的数据，不是一个有效的JSON数据',
      type: 'error'
    }
  }


}