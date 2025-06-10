export const DeviceTypes = {
  CustomDevice: {
    vender: "点灯",
    deviceType: "DiyArduino",
    name: "独立设备",
    image: "diyarduino.png",
    configurator: ["bleConfig", "KeyConfig"],
    description: 
`支持多种设备接入  
如Arduino UNO R4 WiFi、ESP32开发板或其他Linux设备`,
    guide: 
`## 点灯服务使用须知
您使用的是点灯物联网开发者版本，点灯不对开发者版本做稳定性承诺。我们会不定期更新支持库、App及服务器端程序，请确认您使用的是最新版本，才能正常使用blinker各功能。   

***
详细接入方法可见官网文档 https://diandeng.tech/doc
***`,
    component: "Layouter2",
    headerStyle: "dark",
  },
};