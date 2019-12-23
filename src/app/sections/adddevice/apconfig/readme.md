# ApConfig配置流程  
## ios  
0.让设备进入AP配置状态
1.用户手动选择设备ap连接（不需要密码）
2.选择当前环境wifi，并输入密码；
3.用户手动连接设备ap
4.返回app，传输ssid和password；
5.等待注册结果  

## android  
0.让设备进入AP配置状态
1.用户输入ssid、password 
2.app自动搜索"OwnLight_"开头的ssid，并连接传输ssid、password
3.等待注册结果

## android流程优化  
0.长按5秒，红灯闪烁，让设备进入esptouch配置状态  
1.用户输入ssid、password  
2.进行esptouch  
3-1.配置成功  
3-2.配置失败，提示用户长按10秒，蓝灯闪烁，进入ApConfig  
4.app自动搜索"OwnLight_"开头的ssid，并连接传输ssid、password  
5.等待注册结果  

