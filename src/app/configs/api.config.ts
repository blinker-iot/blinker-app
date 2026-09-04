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
    CONNECTION: API_V2_URL + '/account/connection',
  },
  DEVICE_V2: {
    LIST: API_V2_URL + '/devices',
    CREATE: API_V2_URL + '/devices',
    RESOLVE_INSTANCE: API_V2_URL + '/devices:resolve-instance',
    ENABLE_CLOUD: API_V2_URL + '/devices:enable-cloud',
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
    BLE_ENROLLMENT_INTENTS: API_V2_URL + '/ble-enrollment/intents',
    BLE_ENROLLMENT_COMMIT: (intentId: string) =>
      API_V2_URL + '/ble-enrollment/intents/' + encodeURIComponent(intentId) + '/commit',
    BLE_ENROLLMENT_CANCEL: (intentId: string) =>
      API_V2_URL + '/ble-enrollment/intents/' + encodeURIComponent(intentId) + '/cancel',
    EDGE_GATEWAY_ATTACHMENTS: API_V2_URL + '/edge-gateway/attachments',
    EDGE_GATEWAY_ATTACHMENT: (operationId: string) =>
      API_V2_URL + '/edge-gateway/attachments/' + encodeURIComponent(operationId),
    EDGE_GATEWAY_PERMIT_JOINS: API_V2_URL + '/edge-gateway/permit-joins',
    EDGE_GATEWAY_PERMIT_JOIN: (operationId: string) =>
      API_V2_URL + '/edge-gateway/permit-joins/' + encodeURIComponent(operationId),
    PRESENCE_KEY: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/presence-key',
    ALLOCATE_PRESENCE_KEY: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/presence-key:allocate',
    ROTATE_PRESENCE_KEY: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/presence-key:rotate',
    SYNC_PRESENCE_KEY: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/presence-key:sync',
    CONFIRM_PRESENCE_KEY: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/presence-key:confirm',
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
    || url === API.DEVICE_V2.BLE_ENROLLMENT_INTENTS
    || url.startsWith(API.DEVICE_V2.BLE_ENROLLMENT_INTENTS + '/')
    || url === API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENTS
    || url.startsWith(API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENTS + '/')
    || url === API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOINS
    || url.startsWith(API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOINS + '/')
    || isDeviceKeyManagementUrl(url);
}

function isDeviceKeyManagementUrl(url: string): boolean {
  if (url === API_V2_URL + '/devices') return true;
  if (url === API.DEVICE_V2.RESOLVE_INSTANCE) return true;
  if (url === API.DEVICE_V2.ENABLE_CLOUD) return true;

  const prefix = API_V2_URL + '/devices/';
  if (!url.startsWith(prefix)) return false;

  const parts = url.slice(prefix.length).split('/');
  if (!parts[0]) return false;
  if (parts.length === 1) return true;
  if (parts.length === 2) {
    return parts[1] === 'device-key:reveal'
      || parts[1] === 'device-key:rotate'
      || parts[1] === 'presence-key'
      || parts[1] === 'presence-key:allocate'
      || parts[1] === 'presence-key:rotate'
      || parts[1] === 'presence-key:sync'
      || parts[1] === 'presence-key:confirm'
      || parts[1] === 'page-layout'
      || parts[1] === 'share-invitations'
      || parts[1] === 'shares';
  }
  return parts.length === 3
    && !!parts[2]
    && (parts[1] === 'share-invitations' || parts[1] === 'shares');
}
