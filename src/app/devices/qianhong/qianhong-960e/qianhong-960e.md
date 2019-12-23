# 乾泓960e焊台  
相关功能指令如下： 

 
## 0.获取/同步数据数据（心跳包）  
### APP向设备  
```json
{"get":"state"}
```
### 设备反馈  
```json
{
    "state":"online",     // 设备在线状态  
    "temp-state":"0/1/2", // 等待/加热中/到达目标温度
    "switch":"on/off",    // 开关状态
    "power":000,          // 实时功耗   
    "c-temp0":000,        // 当前温度  
    "t-temp1":000,        // 目标温度  
    "cal":0,              // 校准值
    "sleep":"on/off",     // 休眠模式状态
    "powersave":"on/off", // 节能模式状态
    "lock":"on/off"       // 锁定状态  
}
```
---  
## 1.开关按键  
### 打开
```json
{"switch":"on"}
```
### 关闭
```json
{"switch":"off"}
```
---  
## 2.温度调整  
### 设定温度
```json
{"t-temp":000}
```
---  
## 3.温度曲线  
参考blinker云存储文档  
[参考文档](https://diandeng.tech/doc/cloud-storage)  

---  
## 4.定时
跳转到定时页面  
[参考文档](https://diandeng.tech/doc/prodevice-speech-timer)

---    
## 5.休眠  
### 开启休眠
```json
{"sleep":"on"}
```
### 关闭休眠
```json
{"sleep":"off"}
```
---  
## 6.节能  
### 开启节能  
```json
{"powersave":"on"}
```
### 关闭节能  
```json
{"powersave":"off"}
```
---  
## 7.能耗记录  
参考blinker云存储文档  
[参考文档](https://diandeng.tech/doc/cloud-storage)  

---  
## 8.CAL校准  
### 设定校准值
```json
{"cal":-000}
```
---  
## 9.锁定  
### 锁定
```json
{"lock":"on"}
```
### 解锁
```json
{"lock":"off"}
```