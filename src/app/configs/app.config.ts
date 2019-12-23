export const CONFIG = {
    NAME: "blinker",
    LOGIN_LOGO: "assets/img/login-logo.png",
    WEBSITE: "https://diandeng.tech",
    SERVER: "",
    USER_AGREEMENT: "https://diandeng.tech/agreements/user.md",
    PRIVACY_POLICY: "https://diandeng.tech/agreements/privacy.md",
    DEV_AGREEMENT: "https://diandeng.tech/agreements/develop.md",
    UPDATE_FILE: "https://diandeng.tech/update/update.json",
    ABOUT_US: "blinker是一套跨硬件、跨平台的物联网解决方案，提供APP端、设备端、服务器端支持，使用公有云服务进行数据传输存储。可用于多种物联网应用场合，可以帮助用户更好更快地搭建项目。",
    TELEPHONE: "88888888",
    BUILTIN_DEVICES: {
        ENABLE: true
    },
    I18N: {
        ENABLE: false,
        DEFAULT: '简体中文'
    }
}

const SERVER_URL = CONFIG.SERVER + "/api/v1";
const SERVER_URL2 = CONFIG.SERVER + "/api/v2";

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
        AVATAR: CONFIG.SERVER + '/avatar',
        UPLOAD_AVATAR: SERVER_URL + '/user/avatar/upload',
        CHANGE_PASSWORD: SERVER_URL + "/user/password/change",
        CHANGE_PROFILE: SERVER_URL + "/user/profile/modify",
        ADD_DEVICE: SERVER_URL + '/user/config/save',
        DEL_DEVICE: SERVER_URL + '/user/device/remove',
    },
    DEVICE: {
        NEW_VERSION: SERVER_URL + '/user/device/ota/get',
        OTA_STATE: SERVER_URL + '/user/device/ota/upgrade_status',
        TIME_SERIES_DATA: SERVER_URL + '/user/device/pull_cloudStorage/',
        LOAD_CONFIG: SERVER_URL + '/user/device/config/load',
        SAVE_CONFIG: SERVER_URL + '/user/device/config/save',
    },
    DEVICE_CONFIG: {
        DEV: SERVER_URL2 + '/dev/device/conf/all',
        PUBLIC: SERVER_URL2 + '/device/conf/all',
    },
    ADDDEVICE: {
        ADDDEVICE: SERVER_URL + '/user/device/add',
        GET_MQTTKEY: SERVER_URL + '/user/device/diy/add',
        CHECK: SERVER_URL + '/user/device/check',
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
    FEEDBACK: SERVER_URL + '/feedback'
}

//可用的图片文件名
export const ImageList = [
    'diyarduino', 'arduino-red',
    'wifiduino', 'wifiduino-blue', 'esp32',
    'diylinux', 'raspberrypi-blue', 'raspberrypi-zero',
    'linux-logo', 'raspberrypi-logo',
    'ownplug', 'ownairdetector',
    'plant1', 'plant2', 'plant3', 'fan', 'humidifier', 'heater', 'hygrothermograph', 'airconditioner',
    'warninglight', 'ownbulb', 'ownlight', 'ownlight2', 'ownlight3', 'ownlight4',
    'cat', 'cathouse', 'catfood', 'dog', 'doghouse', 'dogfood', 'fishtank', 'birdcage', 'station', 'openjumperfeeder'
]

// 可用的图标名
export const IconList = [
    "",
    "iconfont icon-windmill", "iconfont icon-sun", "iconfont icon-wind", "iconfont icon-drop", "iconfont icon-leaf",
    "iconfont icon-snow", "iconfont icon-shake",
    "iconfont icon-fan", "iconfont icon-air-conditioning",
    "iconfont icon-n1", "iconfont icon-n2", "iconfont icon-n3", "iconfont icon-n4", "iconfont icon-n5",
    "fal fa-power-off", "fal fa-plug",
    "fal fa-thumbs-up", "fal fa-hand-point-up", "fal fa-hand-point-down", "fal fa-hand-point-left", "fal fa-hand-point-right",
    "fal fa-hand-peace", "fal fa-hand-rock", "fal fa-hand-paper", "fal fa-handshake", "fal fa-american-sign-language-interpreting",
    "fal fa-arrow-alt-up", "fal fa-arrow-alt-down", "fal fa-arrow-alt-left", "fal fa-arrow-alt-right",
    "fal fa-meh-blank", "fal fa-meh", "fal fa-surprise", "fal fa-tired", "fal fa-dizzy", "fal fa-frown", "fal fa-smile", "fal fa-skull",
    "fal fa-comments", "fal fa-comment", "fal fa-comment-check", "fal fa-comment-dots", "fal fa-comment-exclamation", "fal fa-comment-smile",
    "fal fa-paper-plane", "fal fa-thumbtack", "fal fa-pencil-alt", "fal fa-heart", "fal fa-heartbeat", "fal fa-home", "fal fa-thermometer-three-quarters",
    "fal fa-atom", "fal fa-burn", "fal fa-fire", "fal fa-tint", "fal fa-sun", "fal fa-umbrella", "fal fa-moon", "fal fa-star", "fas fa-star",
    "fas fa-bell", "fal fa-bell", "fal fa-bell-slash", "fal fa-book", "fal fa-life-ring", "fal fa-ban", "fal fa-gem", "fal fa-leaf", "fal fa-pennant",
    "fas fa-lightbulb", "fal fa-lightbulb", "fal fa-lightbulb-on", "fal fa-lightbulb-exclamation",
    "fal fa-redo-alt", "fal fa-repeat-alt", "fal fa-sync",
    "fal fa-clock",
    "fal fa-utensil-knife", "fal fa-utensil-spoon", "fal fa-utensil-fork", "fal fa-wrench",
    "fal fa-link", "fal fa-thumbtack", "fal fa-anchor",
    "fal fa-signal", "fal fa-signal-4", "fal fa-signal-3", "fal fa-signal-2", "fal fa-signal-1", "fal fa-signal-slash",
    "fal fa-search-minus", "fal fa-search-plus", "fal fa-music",
    "fal fa-wheelchair", "fal fa-bed", "fal fa-walking", "fal fa-door-closed", "fal fa-briefcase",
    "fal fa-lock-alt", "fal fa-lock-alt", "fal fa-lock-alt",
    "fal fa-dog", "fal fa-dog-leashed", "fal fa-cat", "fal fa-crow", "fal fa-fish", "fal fa-rabbit", "fal fa-pig", "fal fa-ram",
    "fal fa-baby-carriage", "fas fa-baby", "far fa-child",
]