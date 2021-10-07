const SERVER_URL_BASE = "https://iot.diandeng.tech";
const SERVER_URL = SERVER_URL_BASE + "/api/v1";
const SERVER_URL2 = SERVER_URL_BASE + "/api/v2";


export const API = {
    LOGIN: SERVER_URL + '/user/login',
    REGISTER: SERVER_URL + '/web/register',
    RETRIEVE: SERVER_URL + '/web/password',
    SMSCODE: SERVER_URL + '/web/sms',
    AUTH: {
        LOGIN: SERVER_URL + '/user/login',
        REGISTER: SERVER_URL + '/user/register',
        RETRIEVE: SERVER_URL + '/user/password/reset',
        SMSCODE: SERVER_URL + '/user/smscode',
        CHECK: SERVER_URL + '/user/token/check',
    },
    USER: {
        ALL: SERVER_URL + '/user/overview',
        DEVICE: SERVER_URL + '/user/device/pull',
        INFO: SERVER_URL + '/user/profile/get',
        SAVE_CONFIG: SERVER_URL + '/user/config/save',
        AVATAR: SERVER_URL_BASE + '/avatar',
        UPLOAD_AVATAR: SERVER_URL + '/user/avatar/upload',
        CHANGE_PASSWORD: SERVER_URL + "/user/password/change",
        CHANGE_PROFILE: SERVER_URL + "/user/profile/modify",
        ADD_DEVICE: SERVER_URL + '/user/config/save',
        DEL_DEVICE: SERVER_URL + '/user/device/remove',
        CANCEL_ACCOUNT: SERVER_URL + '/user/cancel'
    },
    DEVICE: {
        NEW_VERSION: SERVER_URL + '/user/device/ota/get',
        OTA_STATE: SERVER_URL + '/user/device/ota/upgrade_status',
        TIME_SERIES_DATA: SERVER_URL + '/user/device/pull_cloudStorage/',
        LOAD_CONFIG: SERVER_URL + '/user/device/config/load',
        SAVE_CONFIG: SERVER_URL + '/user/device/config/save',
    },
    STORAGE: {
        TIME_SERIES_DATA: '',
        TEXT_DATA: '',
        OBJECT_DATA: ''
    },
    DEVICE_CONFIG: {
        DEV: SERVER_URL2 + '/dev/device/conf/all',
        PUBLIC: SERVER_URL2 + '/device/conf/all',
    },
    ADDDEVICE: {
        ADDDEVICE: SERVER_URL + '/user/device/add',
        GET_MQTTKEY: SERVER_URL + '/user/device/diy/add',
        CHECK: SERVER_URL + '/user/device/check',
        ADDDEVICE_SCAN: SERVER_URL + '/user/device/scancode/register',
    },
    SHARE: {
        SHARE_LIST: SERVER_URL + '/user/device/share/list',
        SHARE_DEVIE: SERVER_URL + '/user/device/share/master',
        DEL_SHARE: SERVER_URL + '/user/device/share/master/delete',
        ACCEPT_SHARED: SERVER_URL + '/user/device/share/slaver/accept',
        REFUSE_SHARED: SERVER_URL + '/user/device/share/slaver/refuse',
        DEL_SHARED: SERVER_URL + '/user/device/share/slaver/delete',
    },
    DEV_CENTER: {
        USER_LEVEL: SERVER_URL2 + "/dev/user",
        USER_AUTH: SERVER_URL2 + "/dev/auth",
        DATAKEYS: SERVER_URL2 + "/dev/storage",
        PRODEVICE: SERVER_URL2 + "/dev/device",
        PRODEVICE_KEY: SERVER_URL2 + "/dev/device/key",
        PRODEVICE_CONFIG: SERVER_URL2 + "/dev/device/conf",
        PRODEVICE_LAYOUTER: SERVER_URL2 + "/dev/device/conf/layouter",
        PUBLIC_PRODEVICE: SERVER_URL2 + "/dev/device/public",
    },
    MESSAGE: SERVER_URL + '/user/message',
    FEEDBACK: SERVER_URL + '/feedback',
    AUTO: {
        TASK: SERVER_URL + "/auto",
        TASK_STATE: SERVER_URL + "/auto/state"
    }
}