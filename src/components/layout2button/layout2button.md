# layout2button  
按键模块  
## 三种类型：
轻触按键：支持tap/pre/pup三个动作  
开关：按下发送on/off  
自定义按键：用户自己定义按下时发送的内容  

## 可用动作:  
| 序号 | 项目 |
|---|---|
| tap |  点一下 | 
| pre | 按下不放 | 
| pup | 释放 | 
| on | 开 | 
| off | 关 | 
| 非JSON | 自定义 | 

### 示例：  
```
{"btn-abc":"tap"}
```
## 可接收动作：  
on/off  
content
icon  
color  

### JSON形式
```json
{"btn-abc":"on"} 等效 {"btn-abc":{"swi":"on"}}  
```
压缩合并：
```json
{"btn-abc":{
    "swi":"on",
    "con":"测试",
    "ico":"fal fa-power-off",
    "col":"#FFFFFF"
}}
```

# （已废弃）  
```json
{"btn-abc":{"icon":"fa-power-off"}}  
{"btn-abc":{"color":"#FFFFFF"}}  
{"btn-abc":{
    "switch":"on",
    "icon":"fa-power-off",
    "color":"#FFFFFF"
}}
```
### 数组形式
```json
{"btn-abc":"on"} 等效 {"btn-abc":["on"]} 
{"btn-abc":["on","已开启","fa-power-off","#FFFFFF"]}  
{"btn-abc":["","","已开启","fa-power-off",]}
{"btn-abc":["","","已开启","","#FFFFFF"]}  
```