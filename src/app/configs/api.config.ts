import { environment } from '../../environments/environment';

const GATEWAY_BASE_URL = environment.gatewayBaseUrl.replace(/\/$/, '');
const API_V1_URL = GATEWAY_BASE_URL + '/api/v1';
const API_V2_URL = GATEWAY_BASE_URL + '/api/v2';
export const BROKER_HOST = 'wss://broker.diandeng.tech:1886';

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
    DELETION_CODE: API_V1_URL + '/account/deletion-code',
    CONNECTION: API_V2_URL + '/account/connection',
  },
  DEVICE_V2: {
    LIST: API_V2_URL + '/devices',
    CREATE: API_V2_URL + '/devices',
    DETAIL: deviceKeyV2Url,
    REVEAL: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/device-key:reveal',
    ROTATE: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/device-key:rotate',
    PAGE_LAYOUT: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/page-layout',
    SHARE_INVITATIONS: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/share-invitations',
    SHARE_INVITATION: (logicalDeviceId: string, invitationId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/share-invitations/'
        + encodeURIComponent(invitationId),
    SHARES: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/shares',
    SHARE: (logicalDeviceId: string, shareId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/shares/' + encodeURIComponent(shareId),
    ACCEPT_SHARE: API_V2_URL + '/share-invitations:accept',
    RECEIVED_SHARES: API_V2_URL + '/shares/received',
    RECEIVED_SHARE: (logicalDeviceId: string) =>
      API_V2_URL + '/shares/received/' + encodeURIComponent(logicalDeviceId),
  },
  DEVICE: {
    NEW_VERSION: API_V1_URL + '/user/device/ota/get',
    OTA_STATE: API_V1_URL + '/user/device/ota/upgrade_status',
    TIME_SERIES_DATA: API_V1_URL + '/user/device/pull_cloudStorage/',
    LOAD_CONFIG: API_V1_URL + '/user/device/config/load',
    SAVE_CONFIG: API_V1_URL + '/user/device/config/save',
  },
  FEEDBACK: {
    SUBMIT: API_V1_URL + '/feedback/submit',
    UPLOAD_IMAGE: API_V1_URL + '/feedback/upload-image',
  },
  USER: {
    INFO: API_V1_URL + '/user/profile/get',
    SAVE_CONFIG: API_V1_URL + '/user/config/save',
    AVATAR: GATEWAY_BASE_URL + '/avatar',
    // The managed Gateway does not currently expose profile/avatar mutation.
    UPLOAD_AVATAR: '',
    CHANGE_PASSWORD: API_V1_URL + '/user/password/change',
    CHANGE_PROFILE: API_V1_URL + '/user/profile/modify',
    DEL_DEVICE: API_V1_URL + '/user/device/remove',
    CANCEL_ACCOUNT: API_V1_URL + '/user/cancel',
  },
  MESSAGE: API_V1_URL + '/user/message',
} as const;

export function isGatewayUrl(url: string): boolean {
  return url.startsWith(API_V1_URL + '/auth/')
    || url === API_V1_URL + '/account'
    || url.startsWith(API_V1_URL + '/account/')
    || url === API_V2_URL + '/account/connection'
    || url.startsWith(API_V1_URL + '/feedback/')
    || url === API.DEVICE_V2.ACCEPT_SHARE
    || url === API.DEVICE_V2.RECEIVED_SHARES
    || url.startsWith(API.DEVICE_V2.RECEIVED_SHARES + '/')
    || isDeviceKeyManagementUrl(url);
}

function isDeviceKeyManagementUrl(url: string): boolean {
  if (url === API_V2_URL + '/devices') return true;

  const prefix = API_V2_URL + '/devices/';
  if (!url.startsWith(prefix)) return false;

  const parts = url.slice(prefix.length).split('/');
  if (!parts[0]) return false;
  if (parts.length === 1) return true;
  if (parts.length === 2) {
    return parts[1] === 'device-key:reveal'
      || parts[1] === 'device-key:rotate'
      || parts[1] === 'page-layout'
      || parts[1] === 'share-invitations'
      || parts[1] === 'shares';
  }
  return parts.length === 3
    && !!parts[2]
    && (parts[1] === 'share-invitations' || parts[1] === 'shares');
}
