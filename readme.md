# 点灯.blinker  
版本：2.5.x  
框架：ionic4、angular8、cordova8  

## 协议
本软体使用GPLv3发布  
如需商业使用，请联系 [点灯科技](https://diandeng.tech/) 获取商业授权  

## 公版Apk下载  
https://github.com/blinker-iot/app-release/releases  

## 环境配置  
[nodejs LTS版本](https://nodejs.org/en/)  
**android:**  
[android SDK](https://developer.android.google.cn/)  
**ios:**  
xcode最新版  


```bash
npm install -g @angular/cli
npm install -g @ionic/cli
npm i -g cordova@8.1.2
cd blinker-app
npm i
```

## 调试  
```bash
ionic serve
```

## 编译  
**android：**  
```bash
cd blinker-app
ionic cordova build android --prod --release
```
如个别资源下载失败，请翻墙后再尝试  

**ios:**  
```bash
cd blinker-app
ionic cordova build ios
```
然后在xcode中编译或发布，更多信息可见[ionic文档](https://ionicframework.com/docs/building/ios)  

## 部分密钥配置
在package.json和config.xml中，以下两款插件需要配置密钥，请自行到相关网站申请密钥并进行配置。
cordova-plugin-bdasr2  百度语音识别  
cordova-plugin-log2c-aliyun-push  阿里移动推送  

## android App签名
android App签名方法
1.安装jdk  
2.在jdk\bin下，运行如下命令生成密钥：  
```base
keytool -genkey -alias <name> -keyalg RSA -validity 10000 -keystore <name>.keystore
```

其中name为自定义的名称  
3.使用如下命令进行签名：
```base
jarsigner -verbose -keystore <name>.keystore -signedjar <apkfilename>_signed.apk <apkfilename>.apk <name>.keystore  
```
如用户不想自行签名发布，可使用我们提供的付费发布服务  

## 相关资源链接
[ionic](https://ionicframework.com/docs/angular/your-first-app)  
[angular](https://angular.cn/docs)  


# 环境版本
Ionic:

   Ionic CLI                     : 5.2.3 (C:\Users\coloz\AppData\Roaming\npm\node_modules\ionic)
   Ionic Framework               : @ionic/angular 5.6.14
   @angular-devkit/build-angular : 0.901.15
   @angular-devkit/schematics    : 9.1.15
   @angular/cli                  : 9.1.15
   @ionic/angular-toolkit        : 2.0.0

Cordova:

   Cordova CLI       : 8.1.2 (cordova-lib@8.1.1)
   Cordova Platforms : android 8.1.0
   Cordova Plugins   : cordova-plugin-ionic-keyboard 2.2.0, cordova-plugin-ionic-webview 4.2.1, (and 26 other plugins)

Utility:

   cordova-res : not installed
   native-run  : 0.2.8

System:

   Android SDK Tools : 26.1.1 (C:\Users\coloz\AppData\Local\Android\Sdk)
   NodeJS            : v14.15.1 (C:\Program Files\nodejs\node.exe)
   npm               : 6.14.4
   OS                : Windows 10