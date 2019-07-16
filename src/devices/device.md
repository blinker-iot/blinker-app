
一个设备在app中的存储结构如下：
```JSON
device = {
      "deviceType": "DiyArduino",
      "deviceName": "deviceName",
      "config": {
        "mode": "ble"/"wifi"/"mqtt",
        "broker":"local"/"aliyun"/"baidu",
        "image": "diyarduino.png",
        "customName": "Arduino",
        "showSwitch": true
      }
      //通信数据存储
      //通过deviceblock组件存储
      "data":{
      }
      //云端数据在本地的存储
      //通过userProvider从服务器拉取存储
      "storage":{
      }
    }
```