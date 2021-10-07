# 氛围灯  
## 组件名  
OwnLightDashboard  

## 反馈信息

### 状态反馈  
```json
{
    "state":"online",     // 设备在线状态
    "switch":"on/off",    // 开关状态
    "mode":"sun/std/bre/stb/rc/grd", // 模式:日光、纯色、呼吸、闪烁、流光、渐变
    "crt":255,            // 色温
    "brt":255,            // 亮度
    "spd":255,            // 速度
    "clr":[255,255,255],  // 颜色
    "grdc":[[172,64,152],[244,125,29]]  // 渐变模式颜色设定
}
```

## 可选模式  

### 日光  
#### 可用key
色温 crt
亮度 brt
示例：  
```json
{"set":
  {"mode":"sun","crt":0,"brt":202}
}
```

### 纯色  
颜色 clr
亮度 brt
示例：  
```json
{"set":
  {"mode":"std","clr":[95,67,155],"brt":202}
}
```

### 呼吸  
颜色 clr
亮度 brt
速度 spd
示例：  
```json
{"set":
  {"mode":"bre","clr":[95,67,155],"brt":202,"spd":151}
}
```

### 闪烁  
亮度 brt
速度 spd   
示例：  
```json
{"set":
  {"mode":"stb","clr":[95,67,155],"brt":202,"spd":151}
}
```

### 流光  
亮度 brt
速度 spd  
示例：  
```json
{"set":
  {"mode":"rc","brt":202,"spd":151}
}
```

### 渐变 
至多设定7种颜色  
速度、亮度、单一颜色持续时长、是否渐变  

示例：  
```json
{"set":{"mode":"grd","brt":121,"spd":151,"grdc":[[172,64,152],[244,125,29]]}}
```

