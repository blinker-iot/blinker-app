import { environment } from '../../environments/environment';

const GATEWAY_BASE_URL = environment.gatewayBaseUrl.replace(/\/$/, '');
const API_V1_URL = GATEWAY_BASE_URL + '/api/v1';
const API_V2_URL = GATEWAY_BASE_URL + '/api/v2';
export const BROKER_HOST = 'wss://broker.diandeng.tech:1886';

const deviceUrl = (deviceId: string) =>
  API_V1_URL + '/devices/' + encodeURIComponent(deviceId);

const deviceKeyV2Url = (logicalDeviceId: string) =>
  API_V2_URL + '/devices/' + encodeURIComponent(logicalDeviceId);

export const API = {
  BASE_URL: GATEWAY_BASE_URL,
  LOGIN: API_V1_URL + '/user/login',
  REGISTER: API_V1_URL + '/web/register',
  RETRIEVE: API_V1_URL + '/web/password',
  SMSCODE: API_V1_URL + '/web/sms',
  AUTH: {
    LOGIN: API_V1_URL + '/user/login',
    REGISTER: API_V1_URL + '/user/register',
    RETRIEVE: API_V1_URL + '/user/password/reset',
    SMSCODE: API_V1_URL + '/user/smscode',
    CHECK: API_V1_URL + '/user/token/check',
    GITHUB_LOGIN: API_V1_URL + '/user/oauth/github',
    WECHAT_LOGIN: API_V1_URL + '/user/oauth/wechat',
    ALTCHA_CHALLENGE: API_V1_URL + '/auth/altcha/challenge',
    EMAIL_CODE: API_V1_URL + '/auth/email/code',
    EMAIL_LOGIN: API_V1_URL + '/auth/email/login',
    WECHAT_MOBILE_START: API_V1_URL + '/auth/wechat/mobile/start',
    WECHAT_MOBILE_LOGIN: API_V1_URL + '/auth/wechat/mobile/login',
    WECHAT_MOBILE_BIND: API_V1_URL + '/auth/wechat/mobile/bind',
    ME: API_V1_URL + '/auth/me',
    REFRESH: API_V1_URL + '/auth/refresh',
    LOGOUT: API_V1_URL + '/auth/logout',
  },
  ACCOUNT: {
    ROOT: API_V1_URL + '/account',
    CONNECTION: API_V1_URL + '/account/connection',
  },
  DEVICE: {
    LIST: API_V1_URL + '/devices',
    CREATE: API_V1_URL + '/devices',
    DETAIL: deviceUrl,
    STATUS: (deviceId: string) => deviceUrl(deviceId) + '/status',
    DATA: (deviceId: string) => deviceUrl(deviceId) + '/data',
    CONFIG: (deviceId: string) => deviceUrl(deviceId) + '/config',
    CONNECTION: (deviceId: string) => deviceUrl(deviceId) + '/connection',
    NEW_VERSION: API_V1_URL + '/user/device/ota/get',
    OTA_STATE: API_V1_URL + '/user/device/ota/upgrade_status',
    TIME_SERIES_DATA: API_V1_URL + '/user/device/pull_cloudStorage/',
    LOAD_CONFIG: API_V1_URL + '/user/device/config/load',
    SAVE_CONFIG: API_V1_URL + '/user/device/config/save',
  },
  DEVICE_V2: {
    CREATE: API_V2_URL + '/devices',
    REVEAL: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/device-key:reveal',
    ROTATE: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/device-key:rotate',
  },
  FEEDBACK: {
    SUBMIT: API_V1_URL + '/feedback/submit',
    UPLOAD_IMAGE: API_V1_URL + '/feedback/upload-image',
  },
  USER: {
    ALL: API_V1_URL + '/user/overview',
    DEVICE: API_V1_URL + '/user/device/pull',
    INFO: API_V1_URL + '/user/profile/get',
    SAVE_CONFIG: API_V1_URL + '/user/config/save',
    AVATAR: GATEWAY_BASE_URL + '/avatar',
    // The managed Gateway does not currently expose profile/avatar mutation.
    UPLOAD_AVATAR: '',
    CHANGE_PASSWORD: API_V1_URL + '/user/password/change',
    CHANGE_PROFILE: API_V1_URL + '/user/profile/modify',
    ADD_DEVICE: API_V1_URL + '/user/config/save',
    DEL_DEVICE: API_V1_URL + '/user/device/remove',
    CANCEL_ACCOUNT: API_V1_URL + '/user/cancel',
  },
  STORAGE: {
    TIME_SERIES_DATA: '',
    TEXT_DATA: '',
    OBJECT_DATA: '',
  },
  ADDDEVICE: {
    ADDDEVICE: API_V1_URL + '/user/device/add',
    GET_MQTTKEY: API_V1_URL + '/user/device/diy/add',
    CHECK: API_V1_URL + '/user/device/check',
    ADDDEVICE_SCAN: API_V1_URL + '/user/device/scancode/register',
  },
  SHARE: {
    SHARE_LIST: API_V1_URL + '/user/device/share/list',
    SHARE_DEVIE: API_V1_URL + '/user/device/share/master',
    DEL_SHARE: API_V1_URL + '/user/device/share/master/delete',
    ACCEPT_SHARED: API_V1_URL + '/user/device/share/slaver/accept',
    REFUSE_SHARED: API_V1_URL + '/user/device/share/slaver/refuse',
    DEL_SHARED: API_V1_URL + '/user/device/share/slaver/delete',
  },
  MESSAGE: API_V1_URL + '/user/message',
  AUTO: {
    TASK: API_V1_URL + '/auto',
    TASK_STATE: API_V1_URL + '/auto/state',
  },
} as const;

export function isGatewayUrl(url: string): boolean {
  return url.startsWith(API_V1_URL + '/auth/')
    || url === API_V1_URL + '/devices'
    || url.startsWith(API_V1_URL + '/devices/')
    || url === API_V1_URL + '/account'
    || url.startsWith(API_V1_URL + '/account/')
    || url.startsWith(API_V1_URL + '/feedback/')
    || isDeviceKeyManagementUrl(url);
}

function isDeviceKeyManagementUrl(url: string): boolean {
  if (url === API_V2_URL + '/devices') return true;

  const prefix = API_V2_URL + '/devices/';
  if (!url.startsWith(prefix)) return false;

  const resourcePath = url.slice(prefix.length);
  const separatorIndex = resourcePath.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex !== resourcePath.lastIndexOf('/')) {
    return false;
  }

  const action = resourcePath.slice(separatorIndex + 1);
  return action === 'device-key:reveal' || action === 'device-key:rotate';
}
