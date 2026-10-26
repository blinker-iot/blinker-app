import { environment } from '../../environments/environment';

const GATEWAY_BASE_URL = environment.gatewayBaseUrl.replace(/\/$/, '');
const API_V1_URL = GATEWAY_BASE_URL + '/api/v1';
const API_V2_URL = GATEWAY_BASE_URL + '/api/v2';

const deviceKeyV2Url = (logicalDeviceId: string) =>
  API_V2_URL + '/devices/' + encodeURIComponent(logicalDeviceId);

export const API = {
  BASE_URL: GATEWAY_BASE_URL,
  CONSOLE_LINK_RESOLVE: API_V2_URL + '/console-links:resolve',
  CONSOLE_VIEW_SESSIONS: API_V2_URL + "/console-view-sessions",
  DEVICE_PANEL: (panelId: string) => API_V2_URL + '/device-panels/' + encodeURIComponent(panelId),
  INTERFACE_REFINE: API_V1_URL + '/interface/refine',
  INTERFACE_WORKFLOW: API_V1_URL + '/interface/workflow',
  INTERFACE_GENERATE: API_V1_URL + '/interface/generate',
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
    REGIONS: API_V2_URL + '/account/regions',
  },
  AUTOMATION: {
    LIST: API_V2_URL + '/automations',
    RULE: (ruleId: string) => API_V2_URL + '/automations/' + encodeURIComponent(ruleId),
  },
  MAPS: {
    CONFIG: API_V2_URL + '/maps/config',
    TILE: (layer: 'base' | 'annotation', z: number, x: number, y: number) =>
      `${API_V2_URL}/maps/tiles/${layer}/${z}/${x}/${y}`,
  },
  DEVICE_V2: {
    LIST: API_V2_URL + '/devices',
    CREATE: API_V2_URL + '/devices',
    RESOLVE_INSTANCE: API_V2_URL + '/devices:resolve-instance',
    ENABLE_CLOUD: API_V2_URL + '/devices:enable-cloud',
    DETAIL: deviceKeyV2Url,
    DISPLAY_METADATA: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/display-metadata',
    LOCATION: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/location',
    ACTIVITY: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/activity',
    STATE_HISTORY: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/state-history',
    PERIODIC_HISTORY: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/periodic-history',
    PERIODIC_HISTORY_POLICY: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/periodic-history-policy',
    TASKS: (logicalDeviceId: string) => deviceKeyV2Url(logicalDeviceId) + '/tasks:execute',
    MANIFEST: (id: string) => deviceKeyV2Url(id) + '/manifest',
    CONSOLE: (id: string) => deviceKeyV2Url(id) + "/console",
    CONSOLE_LINK: (id: string) => deviceKeyV2Url(id) + "/console-link",
    DIRECT_ADMIN: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/direct-access/admin',
    LOCAL_ACCESS: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/local-access',
    REVEAL: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/device-key:reveal',
    ROTATE: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/device-key:rotate',
    PAGE_LAYOUT: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/page-layout',
    UI_CONFIG: (logicalDeviceId: string) =>
      deviceKeyV2Url(logicalDeviceId) + '/ui-config',
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
    PREVIEW_SHARE: API_V2_URL + '/share-invitations:preview',
    DECLINE_SHARE: API_V2_URL + '/share-invitations:decline',
    INVITATION_INBOX: API_V2_URL + '/share-invitations/received',
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
    CANCEL_ACCOUNT: API_V1_URL + '/user/cancel',
  },
  MESSAGE: {
    COLLECTION: API_V2_URL + '/messages',
    UNREAD_SUMMARY: API_V2_URL + '/messages/unread-summary',
    MARK_ALL_READ: API_V2_URL + '/messages:mark-all-read',
    DETAIL: (messageId: string) =>
      API_V2_URL + '/messages/' + encodeURIComponent(messageId),
    READ: (messageId: string) =>
      API_V2_URL + '/messages/' + encodeURIComponent(messageId) + ':read',
  },
  NOTIFICATION_INSTALLATIONS: {
    COLLECTION: API_V2_URL + '/notification-installations',
    DETAIL: (installationId: string) =>
      API_V2_URL + '/notification-installations/'
        + encodeURIComponent(installationId),
  },
} as const;

export function isGatewayUrl(url: string): boolean {
  return url === API.CONSOLE_LINK_RESOLVE
    || url === API.CONSOLE_VIEW_SESSIONS
    || url.startsWith(API.CONSOLE_VIEW_SESSIONS + "/")
    || url === API.INTERFACE_REFINE
    || url.startsWith(API_V2_URL + '/device-panels/')
    || url === API.INTERFACE_WORKFLOW
    || url === API.INTERFACE_GENERATE
    || url.startsWith(API_V1_URL + '/auth/')
    || url === API_V1_URL + '/account'
    || url.startsWith(API_V1_URL + '/account/')
    || url === API_V2_URL + '/account/connection'
    || url === API.ACCOUNT.REGIONS
    || url.startsWith(API_V1_URL + '/feedback/')
    || url === API.DEVICE_V2.ACCEPT_SHARE
    || url === API.DEVICE_V2.PREVIEW_SHARE
    || url === API.DEVICE_V2.DECLINE_SHARE
    || url === API.DEVICE_V2.INVITATION_INBOX
    || url === API.DEVICE_V2.RECEIVED_SHARES
    || url.startsWith(API.DEVICE_V2.RECEIVED_SHARES + '/')
    || url === API.DEVICE_V2.BLE_ENROLLMENT_INTENTS
    || url.startsWith(API.DEVICE_V2.BLE_ENROLLMENT_INTENTS + '/')
    || url === API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENTS
    || url.startsWith(API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENTS + '/')
    || url === API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOINS
    || url.startsWith(API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOINS + '/')
    || url === API.MESSAGE.COLLECTION
    || url.startsWith(API.MESSAGE.COLLECTION + '/')
    || url === API.MESSAGE.MARK_ALL_READ
    || url === API.NOTIFICATION_INSTALLATIONS.COLLECTION
    || url.startsWith(API.NOTIFICATION_INSTALLATIONS.COLLECTION + '/')
    || isManagedMapUrl(url)
    || isAutomationManagementUrl(url)
    || isDeviceKeyManagementUrl(url);
}

function isManagedMapUrl(url: string): boolean {
  if (url === API.MAPS.CONFIG) return true;
  const prefix = API_V2_URL + '/maps/tiles/';
  if (!url.startsWith(prefix)) return false;
  const match = /^(base|annotation)\/([1-9]\d?)\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(url.slice(prefix.length));
  if (!match) return false;
  const z = Number(match[2]), x = Number(match[3]), y = Number(match[4]);
  return z <= 18 && Number.isSafeInteger(x) && Number.isSafeInteger(y) && x < 2 ** z && y < 2 ** z;
}

function isAutomationManagementUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  if (path === API.AUTOMATION.LIST) return true;
  const prefix = API.AUTOMATION.LIST + '/';
  return path.startsWith(prefix)
    && /^[A-Za-z0-9_-]{1,128}(?:\/retire)?$/.test(path.slice(prefix.length));
}

function isDeviceKeyManagementUrl(url: string): boolean {
  // Range/cursor query parameters must not bypass the account Bearer chain.
  url = url.split(/[?#]/, 1)[0];
  if (url === API_V2_URL + '/devices') return true;
  if (url === API.DEVICE_V2.RESOLVE_INSTANCE) return true;
  if (url === API.DEVICE_V2.ENABLE_CLOUD) return true;

  const prefix = API_V2_URL + '/devices/';

  if (!url.startsWith(prefix)) return false;

  const parts = url.slice(prefix.length).split('/');

  if (!parts[0]) return false;
  if (parts.length === 1) return true;

  if (parts.length === 2) {
    return parts[1] === 'manifest'
      || parts[1] === 'device-key:reveal'
      || parts[1] === 'tasks:execute'
      || parts[1] === 'local-access'
      || parts[1] === 'device-key:rotate'
      || parts[1] === 'presence-key'
      || parts[1] === 'presence-key:allocate'
      || parts[1] === 'presence-key:rotate'
      || parts[1] === 'presence-key:sync'
      || parts[1] === 'presence-key:confirm'
      || parts[1] === 'page-layout'
      || parts[1] === 'display-metadata'
      || parts[1] === 'location'
      || parts[1] === 'activity'
      || parts[1] === 'state-history'
      || parts[1] === 'periodic-history'
      || parts[1] === 'periodic-history-policy'
      || parts[1] === 'ui-config'
      || parts[1] === 'console'
      || parts[1] === 'console-link'
      || parts[1] === 'console-public-access'
      || parts[1] === 'share-invitations'
      || parts[1] === 'shares';
  }

  return parts.length === 3
    && !!parts[2]
    && (parts[1] === 'share-invitations' || parts[1] === 'shares'
      || (parts[1] === 'direct-access' && parts[2] === 'admin'));
}
