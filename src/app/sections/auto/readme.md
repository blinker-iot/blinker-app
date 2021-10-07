## 自动化规则
```javascript
let tasks = [
      {
        "enable": true,
        "id": 'aaa',
        "text": "自动开门", // 描述，也可作为自动化的名字
        "mode": "and", //and,or,other
        "time": {
          "day": "1111111",
          "range": [540, 1260],
        },
        "triggers": [
          {
            "deviceId": "8F8518807CC2",
            "source":"switch",
            "operator":"=",
            "value":"on",
            "duration":"60"
          },
          {
            "deviceId": "8F8457081926",
            "source":"temp",
            "operator":">",
            "value":38,
            "duration":"60"
          }
        ],
        "actions": [
          {
            "deviceId": "8F83F444326A",
            "act": { "button": "tap" }
          },
          {
            "deviceId": "8F837BC22158",
            "act": { "button": "press" }
          },
          {
            "deviceId": "8F8339E832AE",
            "act": { "button": "press" }
          }
        ]
      },
      {
        "enable": 0,
        "id": 'bbb',
        "text": "温度调节", // 描述，也可作为自动化的名字
        "mode": "and", //and,or,other
        "time": {
          "day": "0110011",
          "range": [540, 1260],
        },
        "source": [
        ],
        "link": [
        ]
      },
      {
        "ena": 0,
        "id": 'ccc',
        "text": "温度调节", // 描述，也可作为自动化的名字
        "mode": "and", //and,or,other
        "time": {
          "day": "0110011",
          "range": [540, 1260],
        },
        "source": [
          {
            "deviceId": "device0Id",
            "type": "<",
            "key": "humi",
            "value": 40,
            "duration": 1,
            "delete": true//设备已被删除
          },
          {
            "deviceId": "device0Id",
            "type": "<",
            "key": "humi",
            "value": 40,
            "duration": 1,
            "delete": true//设备已被删除
          },
          {
            "deviceId": "device0Id",
            "type": "<",
            "key": "humi",
            "value": 40,
            "duration": 1,
            "delete": true//设备已被删除
          }
        ],
        "link": [
          {
            "deviceId": "device1Id",
            "act": { "button": "tap" }
          },
          {
            "deviceId": "device2Id",
            "act": { "button": "press" }
          },
          {
            "deviceId": "device1Id",
            "act": { "button": "tap" }
          },
        ]
      }
    ]
```



## 触发器/条件  
App内语音、自动化等功能会使用到触发器。  
功能内测中  
### 触发器设置

#### 示例1 
app用配置  
设定触发key为switch，可设置的状态为 开启、关闭、休眠 ，支持设置持续时间  
```javascript
{
  "source":"switch",
  "state":["on","off","sleep"],
  "state_zh":["开启","关闭","休眠"], 
  "enableDuration":true,
  "speech":["状态","是否开机","打开了吗"],   // 语音反馈用
}
```

服务器用配置，由app生成  
当设备打开时立即执行  
```javascript
{
  "source":"switch",
  "operator":"=",
  "value":"on",
  "duration":"60"
}
```

#### 示例2
app用配置
设定触发key为temp，可设置的范围为0~100，支持设置持续时间  
```javascript
{
  "source":"temp",
  "range":[0,100],
  "enableDuration":true,
  "unit":"℃",
  "unit_zh":"摄氏度"     // 语音反馈用
}
```

服务用配置，由app生成 
当传感器温度大于38度，且状态持续60分钟  
```javascript
{
  "source":"temp",
  "operator":">",
  "value":38,
  "duration":"60"
}
```

#### 示例3
app用配置
扫地机，模式key为mode，可用状态为 开始清扫、完成清扫、休眠中
```javascript
{
  "source":"mode",
  "state":["doing","done","sleep"],
  "state_zh":["开始清扫","完成清扫","休眠"], 
  "enableDuration":true,
  "speech":["状态","是否开机","打开了吗"],   // 语音反馈用
}
```

服务器用配置
当扫地机模式为清扫完成时,立即执行  
```javascript
{
  "source":"mode",
  "operator":"=",
  "value":"done",
  "duration":"0"
}
```