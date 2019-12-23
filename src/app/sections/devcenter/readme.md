# 开发者相关接口

## 开发者
### 获取开发者信息  
```
GET /dev/user
```
- 参数：
```
uuid: "",
token: ""
```
- 返回
```json
{
  "message": 1000,
  "detail": {
      "userLevel": "",  // 0/1/2
      "expiryDate":"",
      "auth"{
        "state":0/1/2,
        "vender":"",
      },
      "dataKeyNum": "", // int
      "dataKeyMaxNum": "",    // int
      "proDeviceNum": "", // int
      "proDeviceMaxNum": ""   // int
  }
}
```


### 获取开发者审核状态
```
GET /dev/auth
```
- 参数：
```
uuid: "",
token: ""
```

### 进行审核
```
POST /dev/auth
```
- 参数：
```
uuid: "",
token: ""
```

## 专属设备  

### 创建专属设备
```
POST /dev/device/add
```
- 参数
```
uuid: "",
token: "",
conf: {
  mode: "",
  vender: "",
  image: "",
  name：""
}
```

### 删除专属设备
```
DELETE /dev/device/
```
- 参数
```
uuid: "",
token: "",
conf: {
  "mode": "",
  "vender": "",
  "deviceType": "",
  "password":""
}
```

### 获取设备
```
GET /dev/device/
```
- 参数
```
uuid: "",
token: "",
```

### 获取专属设备密钥
```
GET /dev/device/key
```
- 参数
```
uuid: "",
token: "",
deviceType": "",

```

### 获取设备审核状态  
```
GET /dev/device/public
```
- 参数：
```
uuid: "",
token: "",
deviceType: ""
```
- 返回:
开发中/等待审核/审核通过
```
state: 0/1/2
```

### 发布设备  
```
POST /dev/device/public
```
参数：
```
uuid: "",
token: "",
deviceType: ""
```

### 获取设备配置  
```
GET /dev/device/conf
```
参数：
```
"uuid": "",
"token": "",
"deviceType": ""
```
返回：
```json
{
  "message": 1000,
  "detail": {
    "mode": "",
    "component": "",
    "guide": "",
    "description": "",
    "image": "",
    "vender": "",
    "name": ""
  }
}
```

### 获取设备Layouter配置  
```
GET /dev/device/conf/layouter
```
参数：
```
"uuid": "",
"token": "",
"deviceType": ""
```
返回：
```json
{
  "message": 1000,
  "detail": {
    "layouter":""
  }
}
```

### 设置设备配置
```
POST /dev/device/conf
```
参数：
```
"uuid": "",
"token": "",
"deviceType": "",
"conf": {
  "xxx":"xxx"
}
```

### 获取设备配置
```
POST /dev/device/conf
```
参数：
```
"uuid": "",
"token": "",
"deviceType": "",
"conf": {
  "xxx":"xxx"
}
```

## 获取设备配置

### 开发者配置
```
GET /dev/device/conf/all
```
参数：
```
"uuid": "",
"token": "",
```
返回：
```
{
  XXXXXX:{
        vender: "Diy设备",
        deviceType: "DiyLinux",
        name: "Linux设备",
        image: "diylinux",
        configurator: ["bleConfig", "KeyConfig"],
        guide: `
          <div>本功能用于 Linux设备/树莓派/香蕉派 接入</div>
          <div>需配合blinker python/javascript模块使用</div>
          <div class="h-line10"></div>
          <div>蓝牙接入：</div>
          <div>手机通过蓝牙ble和设备通信</div>
          <div class="h-line10"></div>
          <div>WiFi接入：</div>
          <div>当设备和手机在同一个局域网中，为局域网通信<br />其余情况，使用MQTT远程通信</div>
          <div class="h-line10"></div>
          <div>详细接入方法可见：</div>
          <div>https://doc.blinker.app</div>
          <div class="h-line10"></div>
          <div>请知悉，Diy设备的地理位置将被公开在blinker网站上，如果您不希望公开设备地址，请不要创建Diy设备</div>`,
        component: 'Layouter2',
        headerStyle: 'dark'
  },
  RRRRRR:{

  },
  QQQQQQ:{

  }
}

```

### 公开配置 
```
GET /device/conf/all
```
参数：
```
"uuid": "",
"token": "",
```
返回：
```
{
  XXXXXX:{

  },
  RRRRRR:{

  },
  QQQQQQ:{
    
  }
}

```

## 数据存储
### 获取所有存储key
```
GET /dev/storage
```
参数：
```
"uuid": "",
"token": "",
```
返回：
```
```

### 删除指定key
```
DELETE /dev/storage
```
参数：
```
"uuid": "",
"token": "",
"deviceName":"",
"dataKeys":[]
```
返回：
```