# 点灯.blinker  
版本：2.2.x  
框架：ionic4、angular8、cordova8

## 环境配置  
[nodejs LTS版本](https://nodejs.org/en/)  
**android:**  
[android SDK](https://developer.android.google.cn/)  
**ios:**  
xcode  
```bash
npm i -g ionic
npm i -g cordova@8.1.2
cd blinker
npm i
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

