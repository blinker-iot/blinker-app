export const CONFIG = {
    NAME: "点灯·blinker",
    LOGIN_LOGO: "assets/img/login-logo.png",
    WEBSITE: "https://diandeng.tech",
    USER_AGREEMENT: "https://iot.diandeng.tech/public/user.md",
    PRIVACY_POLICY: "https://iot.diandeng.tech/public/privacy.md",
    DEV_AGREEMENT: "https://iot.diandeng.tech/public/develop.md",
    UPDATE_FILE: "https://iot.diandeng.tech/public/update.json",
    ICON_FILE: "https://iot.diandeng.tech/public/icon.json",
    ABOUT_US: "blinker是一套跨硬件、跨平台的物联网解决方案，提供APP端、设备端、服务器端支持，使用公有云服务进行数据传输存储。可用于多种物联网应用场合，可以帮助用户更好更快地搭建项目。",
    TELEPHONE: "",
    BUILTIN_DEVICES: {
        ENABLE: true
    },
    I18N: {
        ENABLE: true,
        DEFAULT: '简体中文'
    }
}

//可用的图片文件名
export const ImageList = [
    'unknown',
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
    {
        title: "",
        icon: [
            ""
        ]
    },
    {
        title: "方向",
        icon: [
            "fad fa-arrow-alt-up", "fad fa-arrow-alt-down", "fad fa-arrow-alt-left", "fad fa-arrow-alt-right",
            "fad fa-arrow-alt-up r45", "fad fa-arrow-alt-down r135", "fad fa-arrow-alt-left r225", "fad fa-arrow-alt-right r135",
            "fad fa-arrow-alt-circle-up", "fad fa-arrow-alt-circle-down", "fad fa-arrow-alt-circle-left", "fad fa-arrow-alt-circle-right",
            "fad fa-arrow-alt-circle-up r45", "fad fa-arrow-alt-circle-down r135", "fad fa-arrow-alt-circle-left r225", "fad fa-arrow-alt-circle-right r135",
            "fad fa-hand-point-up", "fad fa-hand-point-down", "fad fa-hand-point-left", "fad fa-hand-point-right",
        ]
    },
    {
        title: "调节",
        icon: [
            "fad fa-plus", "fad fa-minus", "fad fa-plus-circle", "fad fa-minus-circle", "fad fa-search-plus", "fad fa-search-minus",
            "fad fa-signal", "fad fa-signal-4", "fad fa-signal-3", "fad fa-signal-2", "fad fa-signal-1", "fad fa-signal-slash",
            "iconfont icon-n1", "iconfont icon-n2", "iconfont icon-n3", "iconfont icon-n4", "iconfont icon-n5",
        ]
    },
    {
        title: "开关",
        icon: [
            "fad fa-lock", "fad fa-unlock", "fad fa-door-closed", "fad fa-door-open", "fad fa-blinds", "fad fa-blinds-raised",
            "fad fa-lightbulb", "fad fa-lightbulb-on", "fad fa-toggle-off", "fad fa-toggle-on", "fad fa-play-circle", "fad fa-pause-circle",
            "fad fa-siren", "fad fa-siren-on"
        ]
    },
    {
        title: "动植物",
        icon: [
            "fad fa-dog", "fad fa-dog-leashed", "fad fa-cat", "fad fa-crow", "fad fa-fish", "fad fa-rabbit", "fad fa-pig", "fad fa-ram", "fas fa-baby",
            "fad fa-seedling", "fad fa-flower-tulip", "fad fa-flower-daffodil", "fad fa-tree",
        ]
    },
    {
        title: "气象",
        icon: [
            "fad fa-sun", "fad fa-moon-stars", "fad fa-cloud-rain", "fad fa-umbrella", "fad fa-clouds",
            "fad fa-wind", "fad fa-smoke", "fad fa-thunderstorm", "fad fa-snowflakes", "fad fa-cloud-hail",
            "fad fa-cloud-showers-heavy", "fad fa-fog",
            "fad fa-humidity", "fad fa-thermometer-three-quarters", "fad fa-temperature-up", "fad fa-temperature-down",
            "fad fa-house-day", "fad fa-house-night"
        ]
    },
    {
        title: "电器/设备/建筑",
        icon: [
            "fad fa-air-conditioner", "fad fa-fan", "fad fa-fan-table", "fad fa-vacuum", "fad fa-charging-station", "fad fa-projector",
            "fad fa-sprinkler", "fad fa-spray-can", "fad fa-faucet-drip", "fad fa-toilet", "fad fa-tachometer-alt-fast", "fad fa-blender", "fad fa-plug",
            "fad fa-weight", "fad fa-tv-retro", "fad fa-tablet-alt", "fad fa-trash", "fad fa-phone", "fad fa-digital-tachograph", "fad fa-calculator",
            "fad fa-microwave", "fad fa-outlet", "fad fa-oven", "fad fa-refrigerator", "fad fa-mailbox",
            "fad fa-sensor", "fad fa-solar-panel", "fad fa-server",
            "fad fa-light-ceiling", "fad fa-lamp-floor", "fad fa-lamp-desk",
            "fad fa-cctv", "fad fa-camera-home", "fad fa-webcam",
            "fad fa-washer", "fad fa-dryer", "fad fa-dryer-alt",
            "fad fa-chair-office", "fad fa-loveseat",
            "fad fa-car", "fad fa-garage-car",
            "fad fa-house", "fad fa-building", "fad fa-industry-alt"
        ]
    },
    {
        title: "表情",
        icon: [
            "fad fa-meh-blank", "fad fa-meh", "fad fa-surprise", "fad fa-tired", "fad fa-dizzy", "fad fa-frown", "fad fa-smile", "fad fa-laugh",
            "fad fa-skull",
            "fad fa-comments", "fad fa-comment", "fad fa-comment-check", "fad fa-comment-dots", "fad fa-comment-exclamation", "fad fa-comment-smile",
        ]
    },
    {
        title: "行为",
        icon: [
            "fad fa-house-leave", "fad fa-house-return", "fad fa-walking", "fad fa-bed", "fad fa-person-carry", "fad fa-portal-enter", "fad fa-portal-exit",
        ]
    },
    {
        title: "其他",
        icon: [
            "fad fa-fire-alt", "fad fa-tint", "fad fa-leaf", "fad fa-heartbeat", "fad fa-redo-alt", "fad fa-repeat-alt", "fad fa-sync", "fad fa-database",
            "fad fa-chart-network", "fad fa-power-off", "fad fa-dna", "fad fa-user-robot", "fad fa-atom", "fad fa-american-sign-language-interpreting",
            "fad fa-cogs", "fad fa-handshake-alt", "fad fa-map-marked-alt", "fad fa-link", "fad fa-route"

        ]
    }

]