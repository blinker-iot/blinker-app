export var deviceTypes = {
  DiyArduino: {
    vender: "点灯",
    deviceType: "DiyArduino",
    name: "独立设备",
    image: "diyarduino.png",
    configurator: ["bleConfig", "KeyConfig"],
    description: `
        支持多种独立设备接入  
        如Arduino、ESP8266、ESP32开发板或其他Linux设备`,
    guide: `
    ## 点灯服务使用须知
    1.您使用的是blinker开发者版本，我们会不定期更新支持库、App及服务器端程序，请确认您使用的是最新版本，才能正常使用blinker各功能。  
    2.点灯不对开发者版本做稳定性承诺。  
    3.有商业使用、或独立部署需求，请联系点灯购买企业版。  

    ***
    详细接入方法可见官网文档 https://diandeng.tech/doc
    ***`,
    component: 'Layouter2',
    headerStyle: 'dark'
  },
  // DiyLinux: {
  //   vender: "独立设备",
  //   deviceType: "DiyLinux",
  //   name: "独立设备beta",
  //   image: "diylinux.png",
  //   configurator: ["bleConfig", "KeyConfig"],
  //   description: `
  //   支持多种独立设备接入  
  //   如Arduino、ESP8266、ESP32开发板或其他Linux设备`,
  //   guide: `
  //   蓝牙接入 推荐设备：  
  //   Arduino + 串口蓝牙模块  
  //   ***
  //   WiFi接入 推荐设备：  
  //   ESP8266 / ESP32  
  //   当设备和手机在同一个局域网中，自动切换为局域网通信  
  //   其余情况，使用MQTT远程通信
  //   ***
  //   Linux设备/树莓派/香蕉派 接入  
  //   需配合blinker python/javascript模块使用  
  //   ***
  //   详细接入方法可见官网文档
  //   ***`,
  //   component: 'Layouter2',
  //   headerStyle: 'dark'
  // },
  // DiyDevice: {
  //   vender: "独立设备",
  //   deviceType: "DiyDevice",
  //   name: "独立设备beta",
  //   image: "diylinux.png",
  //   configurator: ["bleConfig", "KeyConfig"],
  //   description: `
  //       支持Linux设备/树莓派/香蕉派 接入  
  //       需配合blinker python/javascript模块使用`,
  //   guide: `
  //         蓝牙接入：  
  //         手机通过蓝牙ble和设备通信
  //         ***
  //         WiFi接入：  
  //         默认使用MQTT远程通信  
  //         当设备和手机在同一个局域网中，自动切换为局域网通信
  //         ***
  //         详细接入方法可见：  
  //         详细接入方法可见官网文档
  //         ***`,
  //   component: 'Customizer',
  //   headerStyle: 'dark'
  // },
  // OwnAirdetector: {
  //     vender: "点灯科技",
  //     deviceType: "OwnAirdetector",
  //     name: "空气检测器",
  //     image: "ownairdetector.png",
  //     configurator: ["espTouch"],
  //     guideText: ``,
  //     component: 'OwnAirdetectorDashboard',
  //     pages: [
  //         { path: ':id/history', loadChildren: '../devices/own/own-airdetector/own-airdetector.module#OwnAirdetectorModule' }
  //     ],
  //     headerStyle: 'light'
  // },
  // OwnPlug: {
  //     vender: "点灯科技",
  //     deviceType: "OwnPlug",
  //     name: "插座",
  //     image: "ownplug.png",
  //     configurator: ["espTouch"],
  //     guideText: ``,
  //     component: 'OwnAirdetectorDashboard',
  //     pages: [
  //         { path: ':id/history', loadChildren: '../devices/own/own-airdetector/own-airdetector.module#OwnAirdetectorModule' }
  //     ],
  //     headerStyle: 'light'
  // },
  // OwnLight: {
  //     vender: "点灯科技",
  //     deviceType: "OwnLight",
  //     name: "氛围灯",
  //     image: "ownlight.png",
  //     configurator: ["espTouch"],
  //     guideText: ``,
  //     component: 'OwnAirdetectorDashboard',
  //     pages: [
  //         { path: ':id/history', loadChildren: '../devices/own/own-airdetector/own-airdetector.module#OwnAirdetectorModule' }
  //     ],
  //     headerStyle: 'light'
  // },
  // AirStation: {
  //     vender: "点灯科技",
  //     deviceType: "AirStation",
  //     name: "空气监测站",
  //     image: "station.png",
  //     configurator: ["qrScanner"],
  //     guideText: ``,
  //     component: 'OwnAirStationDashboard',
  //     headerStyle: 'light'
  // },
  // WaterStation: {
  //     vender: "点灯科技",
  //     deviceType: "WaterStation",
  //     name: "水文监测站",
  //     image: "station.png",
  //     configurator: ["qrScanner"],
  //     guideText: ``,
  //     component: 'OwnAirStationDashboard',
  //     headerStyle: 'light'
  // },
  // FarmStation: {
  //     vender: "点灯科技",
  //     deviceType: "FarmStation",
  //     name: "农业监测站",
  //     image: "station.png",
  //     configurator: ["qrScanner"],
  //     guideText: ``,
  //     component: 'OwnAirStationDashboard',
  //     headerStyle: 'light'
  // },
}