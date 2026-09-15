# 点灯·blinker — 微信应用审核资料

适用栏目：微信开放平台移动应用申请中的「应用运行流程图」。
整理日期：2026-09-14。应用名称取自当前工程配置。

## 上传文件

解压「微信应用审核-5张流程图.zip」，按编号上传其中的 5 张 PNG。
全部图片为 1800 × 2100 像素；单张小于 0.7 MB，符合本次提供的「最多 10 张、单张不超过 5 MB」要求。

| 顺序 | 图片 | 说明 |
| --- | --- | --- |
| 01 | [应用整体运行流程](01-应用整体运行流程.png) | 从启动、登录到设备添加、使用及管理的主流程 |
| 02 | [微信授权登录与账号关联](02-微信授权登录与账号关联.png) | 微信授权、已关联/未关联账号及取消、失败分支 |
| 03 | [设备添加与接入流程](03-设备添加与接入流程.png) | 密钥接入、Wi-Fi 配网、蓝牙接入三种方式 |
| 04 | [设备控制、数据查看与定时](04-设备控制数据查看与定时.png) | 控制指令、设备上报和受设备能力限制的定时任务 |
| 05 | [设备共享与权限管理](05-设备共享与权限管理.png) | 所有者发出邀请码、接收者领取和共享权限管理 |

图片本身可直接上传。ZIP 用于集中下载和解压，说明文件与 source 目录无需上传。

## 可复制的应用业务说明

点灯·blinker 是一款物联网设备控制与管理应用，为智能硬件用户和开发者提供设备接入、状态查看、控制操作及共享管理功能。用户登录后，可根据设备支持的方式，通过密钥配置、Wi-Fi 配网或蓝牙接入添加设备，并在设备列表中查看和管理设备。进入控制面板后，用户可以操作设备提供的控制组件，查看设备上报的状态及传感器数据，并在设备支持时设置定时任务。设备所有者可通过一次性邀请码向其他用户授予查看或控制权限，后续可管理共享成员。应用还提供区域管理、账号设置、消息查看及意见反馈等功能。

## 可复制的微信能力用途说明

微信能力用于用户授权登录及关联点灯应用账号。已关联账号的用户可在微信授权成功后登录应用；尚未关联账号的用户可通过邮箱验证码完成登录或注册，应用随后尝试关联本次微信授权。用户取消授权、微信不可用或登录失败时，可返回登录页重试或使用邮箱验证码登录。

## 核对范围

本资料按当前本地工程已实现的入口与业务逻辑整理。当前 package.json 版本为 3.0.0；未使用旧 README 中的历史版本描述。

- 登录页提供用户协议与隐私政策链接，未将其绘制成不存在的强制勾选或首次启动弹窗。
- 微信登录未加入手机号绑定步骤，设备共享未写成微信好友或朋友圈分享。
- 数据查看使用「设备上报状态与传感数据」表述，未将无真实数据时的示例历史曲线作为业务证据。
- Wi-Fi 配网完成与设备云端上线分别表述；定时任务注明设备硬件与固件支持条件。

本次验证包括源码核对、图片布局检查、PNG 格式与文件大小检查及 ZIP 完整性检查；未进行真机微信授权或真实设备联调。实际提审安装包应与图示功能一致。

## 维护来源

供内部维护使用，无需提交：

- 启动与登录：src/app/app.component.ts；src/app/sections/login/login.ts、login.html；src/app/core/services/auth.service.ts。
- 设备接入：src/app/sections/guide/guide.page.ts；key-device/key-device.page.ts；ble-device/ble-device.page.ts；src/app/tools/esp32-provision/esp32-provision.page.ts。
- 控制与数据：src/app/device/v2/device-v2.page.ts；src/app/core/device-v2/device-ui.port.ts。
- 定时：src/app/sections/device/device-timer/timer.service.ts；timing-edit/timing-edit.ts。
- 共享：src/app/sections/device/device-share/device-share.ts；src/app/sections/device/share-manager/share-manager.page.ts。

绘图源文件位于 source/render_flows.py 与 source/render_details.py。使用 Pillow 和 Windows 微软雅黑字体，在本目录运行以下命令可重新生成全部图片、压缩包与检查清单：

~~~powershell
python source/render_details.py
~~~

